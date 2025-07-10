#!/bin/bash

# ============================================================================
# TeamLens Backend - Celery System Setup Script
# Script completo para configurar el sistema de colas distribuido
# ============================================================================

set -e  # Salir si cualquier comando falla

# ============================================================================
# VARIABLES DE CONFIGURACIÓN
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TIMESTAMP=$(date '+%Y%m%d_%H%M%S')

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
NC='\033[0m' # No Color

# ============================================================================
# FUNCIONES AUXILIARES
# ============================================================================

# Función para logging con colores
log() {
    local level=$1
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    case $level in
        "INFO")
            echo -e "${CYAN}[${timestamp}] [INFO]${NC} $message"
            ;;
        "SUCCESS")
            echo -e "${GREEN}[${timestamp}] [SUCCESS]${NC} $message"
            ;;
        "WARNING")
            echo -e "${YELLOW}[${timestamp}] [WARNING]${NC} $message"
            ;;
        "ERROR")
            echo -e "${RED}[${timestamp}] [ERROR]${NC} $message"
            ;;
        "STEP")
            echo -e "${PURPLE}[${timestamp}] [STEP]${NC} $message"
            ;;
        *)
            echo -e "${WHITE}[${timestamp}]${NC} $message"
            ;;
    esac
}

# Función para mostrar banner
show_banner() {
    echo -e "${BLUE}"
    echo "============================================================================"
    echo "                    TeamLens Celery System Setup"
    echo "                   Sistema de Colas Distribuido"
    echo "============================================================================"
    echo -e "${NC}"
    echo ""
    echo "Este script configurará:"
    echo "  ✅ Sistema de colas distribuido con Celery"
    echo "  ✅ Redis como message broker"
    echo "  ✅ Flower para monitoreo en tiempo real"
    echo "  ✅ Workers especializados por tipo de tarea"
    echo "  ✅ Configuración optimizada para AWS"
    echo ""
    echo -e "${YELLOW}Duración estimada: 5-10 minutos${NC}"
    echo ""
}

# Función para verificar requisitos del sistema
check_system_requirements() {
    log "STEP" "🔍 Verificando requisitos del sistema..."
    
    local requirements_met=true
    
    # Verificar Python 3
    if ! command -v python3 &> /dev/null; then
        log "ERROR" "❌ Python 3 no encontrado. Instala Python 3.8+ para continuar"
        requirements_met=false
    else
        local python_version=$(python3 --version 2>&1 | cut -d' ' -f2)
        log "INFO" "✅ Python encontrado: $python_version"
    fi
    
    # Verificar pip
    if ! command -v pip3 &> /dev/null; then
        log "ERROR" "❌ pip3 no encontrado. Instala pip para Python 3"
        requirements_met=false
    else
        log "INFO" "✅ pip3 encontrado"
    fi
    
    # Verificar Node.js y npm
    if ! command -v node &> /dev/null; then
        log "WARNING" "⚠️ Node.js no encontrado. Se necesita para el backend"
    else
        local node_version=$(node --version)
        log "INFO" "✅ Node.js encontrado: $node_version"
    fi
    
    # Verificar Docker (opcional pero recomendado)
    if ! command -v docker &> /dev/null; then
        log "WARNING" "⚠️ Docker no encontrado. Se recomienda para Redis"
    else
        local docker_version=$(docker --version)
        log "INFO" "✅ Docker encontrado: $docker_version"
    fi
    
    # Verificar Git
    if ! command -v git &> /dev/null; then
        log "WARNING" "⚠️ Git no encontrado"
    else
        log "INFO" "✅ Git encontrado"
    fi
    
    if [ "$requirements_met" = false ]; then
        log "ERROR" "❌ Faltan requisitos críticos del sistema. Revisa e instala los componentes faltantes."
        exit 1
    fi
    
    log "SUCCESS" "✅ Todos los requisitos del sistema están satisfechos"
}

# Función para crear estructura de directorios
create_directory_structure() {
    log "STEP" "📁 Creando estructura de directorios..."
    
    cd "$PROJECT_ROOT"
    
    # Directorios principales
    mkdir -p logs
    mkdir -p data/redis
    mkdir -p temp
    mkdir -p config
    mkdir -p scripts/systemd
    mkdir -p monitoring
    
    # Directorios para desarrollo
    mkdir -p data/development
    mkdir -p data/testing
    
    # Permisos apropiados
    chmod 755 logs data temp config scripts monitoring
    
    log "SUCCESS" "✅ Estructura de directorios creada"
}

# Función para instalar dependencias Python
install_python_dependencies() {
    log "STEP" "📦 Instalando dependencias Python para Celery..."
    
    cd "$PROJECT_ROOT"
    
    # Crear entorno virtual si no existe
    if [ ! -d "venv" ]; then
        log "INFO" "🐍 Creando entorno virtual Python..."
        python3 -m venv venv
    fi
    
    # Activar entorno virtual
    source venv/bin/activate
    
    # Actualizar pip
    log "INFO" "⬆️ Actualizando pip..."
    pip install --upgrade pip
    
    # Instalar dependencias básicas
    log "INFO" "📋 Instalando dependencias básicas..."
    pip install wheel setuptools
    
    # Instalar dependencias de Celery
    if [ -f "requirements.txt" ]; then
        log "INFO" "📋 Instalando dependencias desde requirements.txt..."
        pip install -r requirements.txt
    else
        log "INFO" "📋 Instalando dependencias básicas de Celery..."
        pip install celery[redis]==5.3.0
        pip install redis==4.5.4
        pip install flower==2.0.1
        pip install kombu==5.3.0
        pip install pymongo==4.6.0
        pip install psutil
    fi
    
    # Generar requirements.txt actualizado
    log "INFO" "📄 Generando requirements.txt actualizado..."
    pip freeze > requirements_generated.txt
    
    log "SUCCESS" "✅ Dependencias Python instaladas exitosamente"
}

# Función para instalar dependencias Node.js
install_nodejs_dependencies() {
    log "STEP" "📦 Instalando dependencias Node.js adicionales..."
    
    cd "$PROJECT_ROOT"
    
    # Verificar si package.json existe
    if [ ! -f "package.json" ]; then
        log "WARNING" "⚠️ package.json no encontrado. Saltando instalación de dependencias Node.js"
        return
    fi
    
    # Instalar dependencias para integración con Celery
    log "INFO" "📋 Instalando dependencias adicionales..."
    
    # Dependencias para Redis y UUID
    npm install ioredis uuid @types/uuid
    
    # Dependencias de desarrollo
    npm install --save-dev @types/ioredis
    
    log "SUCCESS" "✅ Dependencias Node.js instaladas"
}

# Función para configurar Redis
setup_redis() {
    log "STEP" "🔴 Configurando Redis..."
    
    # Verificar si Docker está disponible
    if command -v docker &> /dev/null; then
        log "INFO" "🐳 Configurando Redis con Docker..."
        
        cd "$PROJECT_ROOT"
        
        # Detener contenedores Redis anteriores
        docker stop teamlens_redis 2>/dev/null || true
        docker rm teamlens_redis 2>/dev/null || true
        
        # Iniciar Redis con Docker Compose
        if [ -f "docker-compose.redis.yml" ]; then
            log "INFO" "🚀 Iniciando Redis con Docker Compose..."
            docker-compose -f docker-compose.redis.yml up -d redis
            
            # Esperar a que Redis esté listo
            log "INFO" "⏳ Esperando a que Redis esté listo..."
            sleep 10
            
            # Verificar conectividad
            if docker exec teamlens_redis redis-cli ping 2>/dev/null | grep -q "PONG"; then
                log "SUCCESS" "✅ Redis configurado y funcionando con Docker"
            else
                log "ERROR" "❌ Redis no responde correctamente"
                return 1
            fi
        else
            log "WARNING" "⚠️ docker-compose.redis.yml no encontrado"
        fi
    else
        log "WARNING" "⚠️ Docker no disponible. Asegúrate de instalar Redis manualmente"
        log "INFO" "📋 Para instalar Redis manualmente:"
        log "INFO" "   Ubuntu/Debian: sudo apt install redis-server"
        log "INFO" "   CentOS/RHEL: sudo yum install redis"
        log "INFO" "   macOS: brew install redis"
    fi
}

# Función para configurar archivos de configuración
setup_configuration_files() {
    log "STEP" "⚙️ Configurando archivos de configuración..."
    
    cd "$PROJECT_ROOT"
    
    # Crear archivo .env si no existe
    if [ ! -f ".env" ]; then
        if [ -f ".env.example" ]; then
            log "INFO" "📄 Creando .env desde .env.example..."
            cp .env.example .env
            
            # Generar valores aleatorios para desarrollo
            local redis_password=$(openssl rand -base64 32 | tr -d '/')
            local jwt_secret=$(openssl rand -base64 64 | tr -d '/')
            
            # Reemplazar valores por defecto
            sed -i.bak "s/teamlens_redis_secure_password_2024/$redis_password/g" .env
            sed -i.bak "s/your_super_secure_jwt_secret_here_change_in_production/$jwt_secret/g" .env
            
            rm .env.bak 2>/dev/null || true
            
            log "SUCCESS" "✅ Archivo .env creado con valores aleatorios"
            log "INFO" "🔐 Credenciales generadas automáticamente para desarrollo"
        else
            log "WARNING" "⚠️ .env.example no encontrado. Crea manualmente el archivo .env"
        fi
    else
        log "INFO" "📄 Archivo .env ya existe"
    fi
    
    # Crear archivo de configuración de logging
    cat > config/logging.json << 'EOF'
{
  "version": 1,
  "disable_existing_loggers": false,
  "formatters": {
    "detailed": {
      "format": "%(asctime)s [%(levelname)s] %(name)s.%(funcName)s:%(lineno)d - %(message)s"
    },
    "simple": {
      "format": "%(levelname)s - %(message)s"
    }
  },
  "handlers": {
    "console": {
      "class": "logging.StreamHandler",
      "level": "INFO",
      "formatter": "detailed"
    },
    "file": {
      "class": "logging.handlers.RotatingFileHandler",
      "level": "DEBUG",
      "formatter": "detailed",
      "filename": "logs/celery.log",
      "maxBytes": 10485760,
      "backupCount": 5
    }
  },
  "loggers": {
    "celery": {
      "level": "INFO",
      "handlers": ["console", "file"],
      "propagate": false
    }
  }
}
EOF
    
    log "SUCCESS" "✅ Archivos de configuración creados"
}

# Función para crear scripts de servicio systemd
create_systemd_services() {
    log "STEP" "🔧 Creando servicios systemd..."
    
    local user=$(whoami)
    local project_path="$PROJECT_ROOT"
    
    # Servicio para Celery Workers
    cat > scripts/systemd/teamlens-celery.service << EOF
[Unit]
Description=TeamLens Celery Workers
After=network.target redis.service

[Service]
Type=simple
User=$user
Group=$user
WorkingDirectory=$project_path
Environment=PATH=$project_path/venv/bin
ExecStart=$project_path/venv/bin/celery -A src.celery_app worker --loglevel=info --concurrency=4
ExecReload=/bin/kill -HUP \$MAINPID
KillMode=mixed
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

    # Servicio para Flower
    cat > scripts/systemd/teamlens-flower.service << EOF
[Unit]
Description=TeamLens Flower (Celery Monitoring)
After=network.target redis.service teamlens-celery.service

[Service]
Type=simple
User=$user
Group=$user
WorkingDirectory=$project_path
Environment=PATH=$project_path/venv/bin
ExecStart=$project_path/venv/bin/flower -A src.celery_app --port=5555 --basic_auth=admin:flower123
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF
    
    log "SUCCESS" "✅ Servicios systemd creados en scripts/systemd/"
    log "INFO" "📋 Para instalar en el sistema:"
    log "INFO" "   sudo cp scripts/systemd/*.service /etc/systemd/system/"
    log "INFO" "   sudo systemctl daemon-reload"
    log "INFO" "   sudo systemctl enable teamlens-celery teamlens-flower"
    log "INFO" "   sudo systemctl start teamlens-celery teamlens-flower"
}

# Función para realizar tests básicos
run_basic_tests() {
    log "STEP" "🧪 Ejecutando tests básicos del sistema..."
    
    cd "$PROJECT_ROOT"
    source venv/bin/activate
    
    # Test 1: Conectividad con Redis
    log "INFO" "🔴 Testeando conectividad con Redis..."
    if python3 -c "
import redis
import os
redis_url = os.getenv('REDIS_URL', 'redis://localhost:6379/0')
r = redis.from_url(redis_url)
print('Redis ping:', r.ping())
print('✅ Redis: OK')
" 2>/dev/null; then
        log "SUCCESS" "✅ Test Redis: PASSED"
    else
        log "ERROR" "❌ Test Redis: FAILED"
        return 1
    fi
    
    # Test 2: Importación de Celery
    log "INFO" "🥬 Testeando importación de Celery..."
    if python3 -c "
from src.celery_app import celery_app
print('Celery app:', celery_app)
print('✅ Celery importación: OK')
" 2>/dev/null; then
        log "SUCCESS" "✅ Test Celery: PASSED"
    else
        log "ERROR" "❌ Test Celery: FAILED"
        return 1
    fi
    
    # Test 3: Health check básico
    log "INFO" "💓 Testeando health check..."
    if python3 -c "
import sys
sys.path.append('.')
from src.services.celery_service import celeryService
import asyncio

async def test():
    try:
        await celeryService.connect()
        print('✅ CeleryService: OK')
        await celeryService.disconnect()
        return True
    except Exception as e:
        print(f'❌ CeleryService error: {e}')
        return False

result = asyncio.run(test())
sys.exit(0 if result else 1)
" 2>/dev/null; then
        log "SUCCESS" "✅ Test CeleryService: PASSED"
    else
        log "WARNING" "⚠️ Test CeleryService: FAILED (normal si Node.js no está configurado)"
    fi
    
    log "SUCCESS" "✅ Tests básicos completados"
}

# Función para mostrar información final
show_final_information() {
    log "STEP" "📋 Información del sistema configurado..."
    
    echo ""
    echo -e "${GREEN}============================================================================${NC}"
    echo -e "${GREEN}                    ✅ CONFIGURACIÓN COMPLETADA ✅${NC}"
    echo -e "${GREEN}============================================================================${NC}"
    echo ""
    
    echo -e "${CYAN}🔗 URLs de Acceso:${NC}"
    echo "  📊 Flower (Monitoreo):  http://localhost:5555"
    echo "  🔴 Redis Commander:     http://localhost:8081 (desarrollo)"
    echo ""
    
    echo -e "${CYAN}📋 Comandos Útiles:${NC}"
    echo "  🚀 Iniciar workers:     ./scripts/start_celery_worker.sh start"
    echo "  📊 Estado workers:      ./scripts/start_celery_worker.sh status"
    echo "  🛑 Detener workers:     ./scripts/start_celery_worker.sh stop"
    echo "  💓 Health check:        ./scripts/start_celery_worker.sh health"
    echo ""
    
    echo -e "${CYAN}📁 Archivos Importantes:${NC}"
    echo "  ⚙️ Configuración:       .env"
    echo "  📄 Logs:               logs/celery_worker_*.log"
    echo "  🔧 Scripts:            scripts/"
    echo "  📊 Monitoreo:          http://localhost:5555"
    echo ""
    
    echo -e "${CYAN}🔄 Próximos Pasos:${NC}"
    echo "  1. ✅ Verificar configuración en .env"
    echo "  2. 🚀 Iniciar workers: ./scripts/start_celery_worker.sh start"
    echo "  3. 🌐 Acceder a Flower: http://localhost:5555"
    echo "  4. 🧪 Probar endpoints: POST /activities/:id/algorithm/execute-celery"
    echo "  5. 📊 Monitorear colas y tareas en tiempo real"
    echo ""
    
    echo -e "${YELLOW}⚠️  IMPORTANTE PARA PRODUCCIÓN:${NC}"
    echo "  🔐 Cambiar credenciales en .env"
    echo "  🏗️ Configurar AWS ElastiCache para Redis"
    echo "  📡 Configurar Auto Scaling de workers"
    echo "  📊 Configurar monitoreo con CloudWatch"
    echo ""
}

# ============================================================================
# FUNCIÓN PRINCIPAL
# ============================================================================

main() {
    show_banner
    
    # Solicitar confirmación
    echo -e "${YELLOW}¿Deseas continuar con la configuración? (y/N):${NC}"
    read -r response
    if [[ ! "$response" =~ ^[Yy]$ ]]; then
        log "INFO" "👋 Configuración cancelada por el usuario"
        exit 0
    fi
    
    echo ""
    log "INFO" "🚀 Iniciando configuración del sistema de colas TeamLens..."
    
    # Ejecutar pasos de configuración
    check_system_requirements
    create_directory_structure
    install_python_dependencies
    install_nodejs_dependencies
    setup_configuration_files
    setup_redis
    create_systemd_services
    run_basic_tests
    
    echo ""
    show_final_information
    
    log "SUCCESS" "🎉 ¡Configuración completada exitosamente!"
    log "INFO" "⏱️ Tiempo total: $((SECONDS / 60)) minutos $((SECONDS % 60)) segundos"
}

# ============================================================================
# MANEJO DE ARGUMENTOS DE LÍNEA DE COMANDOS
# ============================================================================

case "${1:-}" in
    "install"|"setup"|"")
        main
        ;;
    "test")
        log "INFO" "🧪 Ejecutando solo tests..."
        run_basic_tests
        ;;
    "redis")
        log "INFO" "🔴 Configurando solo Redis..."
        setup_redis
        ;;
    "deps"|"dependencies")
        log "INFO" "📦 Instalando solo dependencias..."
        install_python_dependencies
        install_nodejs_dependencies
        ;;
    "help"|"-h"|"--help")
        echo "Uso: $0 [comando]"
        echo ""
        echo "Comandos:"
        echo "  install, setup     - Configuración completa (por defecto)"
        echo "  test              - Ejecutar solo tests"
        echo "  redis             - Configurar solo Redis"
        echo "  deps              - Instalar solo dependencias"
        echo "  help              - Mostrar esta ayuda"
        ;;
    *)
        log "ERROR" "❌ Comando desconocido: $1"
        echo "Usa '$0 help' para ver los comandos disponibles"
        exit 1
        ;;
esac 