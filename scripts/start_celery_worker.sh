#!/bin/bash

# ============================================================================
# TeamLens Backend - Celery Worker Startup Script
# Script optimizado para iniciar workers de Celery en producción AWS
# ============================================================================

set -e  # Salir si cualquier comando falla

# ============================================================================
# CONFIGURACIÓN DE VARIABLES DE ENTORNO
# ============================================================================

# Directorio base del proyecto
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

# Configuración de entorno
export PYTHONPATH="${PROJECT_DIR}:${PYTHONPATH}"
export CELERY_APP="src.celery_app:celery_app"

# Configuración de Redis (por defecto local, AWS ElastiCache en producción)
export REDIS_URL="${REDIS_URL:-redis://localhost:6379/0}"
export REDIS_RESULT_BACKEND="${REDIS_RESULT_BACKEND:-redis://localhost:6379/1}"

# Configuración de MongoDB
export MONGODB_URI="${MONGODB_URI:-mongodb://localhost:27017/test}"

# Configuración de logging
export CELERY_LOG_LEVEL="${CELERY_LOG_LEVEL:-INFO}"
export ENVIRONMENT="${ENVIRONMENT:-development}"

# ============================================================================
# FUNCIONES AUXILIARES
# ============================================================================

# Función para logging con timestamp
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [CELERY-STARTUP] $1"
}

# Función para verificar dependencias
check_dependencies() {
    log "🔍 Verificando dependencias..."
    
    # Verificar Python y pip
    if ! command -v python3 &> /dev/null; then
        log "❌ Python3 no encontrado"
        exit 1
    fi
    
    # Verificar que Redis esté accesible
    if ! python3 -c "import redis; r = redis.from_url('$REDIS_URL'); r.ping()" 2>/dev/null; then
        log "❌ Redis no accesible en: $REDIS_URL"
        log "💡 Asegúrate de que Redis esté ejecutándose:"
        log "   docker-compose -f docker-compose.redis.yml up -d redis"
        exit 1
    fi
    
    # Verificar que MongoDB esté accesible
    if ! python3 -c "from pymongo import MongoClient; MongoClient('$MONGODB_URI').admin.command('ping')" 2>/dev/null; then
        log "⚠️ MongoDB no accesible en: $MONGODB_URI"
        log "💡 Continuando... MongoDB se verificará en runtime"
    fi
    
    log "✅ Dependencias verificadas"
}

# Función para instalar dependencias Python
install_dependencies() {
    log "📦 Verificando dependencias Python..."
    
    if [ -f "requirements.txt" ]; then
        log "📋 Instalando dependencias desde requirements.txt..."
        pip3 install -r requirements.txt --quiet
    else
        log "📋 Instalando dependencias básicas de Celery..."
        pip3 install celery[redis] redis pymongo --quiet
    fi
    
    log "✅ Dependencias Python instaladas"
}

# Función para crear directorios necesarios
setup_directories() {
    log "📁 Creando directorios necesarios..."
    
    mkdir -p logs
    mkdir -p data/redis
    mkdir -p temp
    
    log "✅ Directorios creados"
}

# Función para limpiar procesos anteriores
cleanup_previous() {
    log "🧹 Limpiando procesos anteriores de Celery..."
    
    # Buscar y terminar procesos de Celery worker existentes
    pkill -f "celery worker" || true
    
    # Limpiar archivos de PID si existen
    rm -f logs/celery_worker_*.pid
    
    log "✅ Limpieza completada"
}

# ============================================================================
# FUNCIÓN PRINCIPAL DE INICIO
# ============================================================================

start_worker() {
    local worker_name="${1:-algorithm_worker}"
    local concurrency="${2:-4}"
    local queues="${3:-algorithm_queue,validation_queue,cleanup_queue,default}"
    local log_level="${4:-INFO}"
    
    log "🚀 Iniciando Celery Worker: $worker_name"
    log "📊 Configuración:"
    log "   - Concurrency: $concurrency"
    log "   - Queues: $queues"
    log "   - Log Level: $log_level"
    log "   - Redis URL: $REDIS_URL"
    log "   - Environment: $ENVIRONMENT"
    
    # Configurar archivos de log
    local log_file="logs/celery_worker_${worker_name}.log"
    local pid_file="logs/celery_worker_${worker_name}.pid"
    
    # Comando base de Celery
    local celery_cmd=(
        celery
        -A "$CELERY_APP"
        worker
        --loglevel="$log_level"
        --concurrency="$concurrency"
        --queues="$queues"
        --hostname="${worker_name}@%h"
        --pidfile="$pid_file"
        --logfile="$log_file"
        --time-limit=600         # 10 minutos hard timeout
        --soft-time-limit=300    # 5 minutos soft timeout
        --max-tasks-per-child=50 # Prevenir memory leaks
        --prefetch-multiplier=1  # Una tarea por proceso
        --without-gossip         # Reducir overhead de red
        --without-mingle         # Reducir tiempo de startup
        --without-heartbeat      # Usar health checks externos
    )
    
    # Configuración específica por entorno
    if [ "$ENVIRONMENT" = "production" ]; then
        log "🏭 Configuración de producción AWS activada"
        celery_cmd+=(
            --optimize=2
            --pool=prefork
            --autoscale=8,2    # Auto-scale entre 2-8 workers
        )
    else
        log "🔧 Configuración de desarrollo activada"
        celery_cmd+=(
            --pool=prefork
        )
    fi
    
    # Ejecutar Celery Worker
    log "▶️ Ejecutando comando: ${celery_cmd[*]}"
    exec "${celery_cmd[@]}"
}

# ============================================================================
# FUNCIÓN PARA MÚLTIPLES WORKERS
# ============================================================================

start_multiple_workers() {
    local num_workers="${1:-2}"
    
    log "🚀 Iniciando $num_workers workers de Celery..."
    
    # Worker especializado en algoritmos (alta prioridad)
    if [ "$num_workers" -ge 1 ]; then
        log "🧠 Iniciando Algorithm Worker..."
        nohup bash "$0" worker algorithm_worker 2 algorithm_queue INFO > logs/algorithm_worker.out 2>&1 &
        sleep 2
    fi
    
    # Worker para validaciones y tareas generales
    if [ "$num_workers" -ge 2 ]; then
        log "✅ Iniciando Validation Worker..."
        nohup bash "$0" worker validation_worker 4 validation_queue,default INFO > logs/validation_worker.out 2>&1 &
        sleep 2
    fi
    
    # Worker para limpieza (baja prioridad)
    if [ "$num_workers" -ge 3 ]; then
        log "🧹 Iniciando Cleanup Worker..."
        nohup bash "$0" worker cleanup_worker 2 cleanup_queue INFO > logs/cleanup_worker.out 2>&1 &
        sleep 2
    fi
    
    log "✅ $num_workers workers iniciados"
    log "📊 Monitoreo disponible en: http://localhost:5555 (Flower)"
    log "📝 Logs disponibles en: logs/"
}

# ============================================================================
# FUNCIÓN DE HEALTH CHECK
# ============================================================================

health_check() {
    log "🔍 Ejecutando health check de Celery..."
    
    # Verificar que Redis esté respondiendo
    if python3 -c "import redis; r = redis.from_url('$REDIS_URL'); print('Redis ping:', r.ping())" 2>/dev/null; then
        log "✅ Redis: OK"
    else
        log "❌ Redis: FAIL"
        return 1
    fi
    
    # Verificar workers activos usando Celery inspect
    if python3 -c "
from src.celery_app import celery_app
import sys
try:
    inspect = celery_app.control.inspect()
    active = inspect.active()
    if active:
        print('Workers activos:', len(active))
        for worker, tasks in active.items():
            print(f'  {worker}: {len(tasks)} tareas')
    else:
        print('No hay workers activos')
        sys.exit(1)
except Exception as e:
    print('Error conectando con workers:', e)
    sys.exit(1)
"; then
        log "✅ Workers: OK"
    else
        log "❌ Workers: FAIL"
        return 1
    fi
    
    log "✅ Health check completado exitosamente"
}

# ============================================================================
# FUNCIONES DE GESTIÓN
# ============================================================================

stop_workers() {
    log "🛑 Deteniendo workers de Celery..."
    
    # Graceful shutdown usando Celery control
    python3 -c "
from src.celery_app import celery_app
try:
    celery_app.control.shutdown()
    print('Shutdown signal enviado a workers')
except Exception as e:
    print('Error enviando shutdown signal:', e)
" || true
    
    # Backup: kill processes
    sleep 5
    pkill -f "celery worker" || true
    
    # Limpiar archivos PID
    rm -f logs/celery_worker_*.pid
    
    log "✅ Workers detenidos"
}

restart_workers() {
    log "🔄 Reiniciando workers de Celery..."
    stop_workers
    sleep 3
    start_multiple_workers "${1:-2}"
}

# ============================================================================
# MAIN SCRIPT LOGIC
# ============================================================================

case "${1:-start}" in
    start)
        log "🚀 Iniciando sistema de colas TeamLens..."
        check_dependencies
        install_dependencies
        setup_directories
        cleanup_previous
        start_multiple_workers "${2:-2}"
        ;;
    
    worker)
        # Modo para iniciar un worker específico
        start_worker "$2" "$3" "$4" "$5"
        ;;
    
    stop)
        stop_workers
        ;;
    
    restart)
        restart_workers "${2:-2}"
        ;;
    
    health)
        health_check
        ;;
    
    status)
        log "📊 Estado de workers de Celery:"
        python3 -c "
from src.celery_app import celery_app
import json
try:
    inspect = celery_app.control.inspect()
    stats = inspect.stats()
    active = inspect.active()
    
    print('=== ESTADÍSTICAS DE WORKERS ===')
    if stats:
        for worker, stat in stats.items():
            print(f'Worker: {worker}')
            print(f'  Tareas totales: {stat.get(\"total\", 0)}')
            print(f'  Pool: {stat.get(\"pool\", {}).get(\"max-concurrency\", \"N/A\")}')
    
    print('\\n=== TAREAS ACTIVAS ===')
    if active:
        for worker, tasks in active.items():
            print(f'{worker}: {len(tasks)} tareas activas')
    else:
        print('No hay tareas activas')
        
except Exception as e:
    print(f'Error obteniendo estado: {e}')
"
        ;;
    
    *)
        echo "Uso: $0 {start|stop|restart|health|status|worker}"
        echo ""
        echo "Comandos:"
        echo "  start [num_workers]  - Iniciar workers (default: 2)"
        echo "  stop                 - Detener todos los workers"
        echo "  restart [num_workers]- Reiniciar workers"
        echo "  health               - Health check"
        echo "  status               - Estado de workers"
        echo "  worker <name> <conc> <queues> <log> - Iniciar worker específico"
        echo ""
        echo "Ejemplos:"
        echo "  $0 start 3           - Iniciar 3 workers"
        echo "  $0 restart           - Reiniciar con configuración por defecto"
        echo "  $0 worker my_worker 4 algorithm_queue INFO"
        exit 1
        ;;
esac 