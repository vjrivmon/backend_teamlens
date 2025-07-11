# ============================================================================
# TeamLens Backend - Celery Application Configuration
# Sistema de colas distribuido para formación de grupos escalable
# ============================================================================

import os
import logging
from celery import Celery
from kombu import Queue, Exchange

# ============================================================================
# CONFIGURACIÓN DE LOGGING EMPRESARIAL
# ============================================================================

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ============================================================================
# CONFIGURACIÓN DE CELERY PARA PRODUCCIÓN
# ============================================================================

# Configuración del broker Redis (AWS ElastiCache en producción)
REDIS_URL = os.getenv('REDIS_URL', 'redis://localhost:6379/0')
REDIS_RESULT_BACKEND = os.getenv('REDIS_RESULT_BACKEND', 'redis://localhost:6379/1')

# Inicialización de la aplicación Celery
celery_app = Celery(
    'teamlens_algorithm_processor',
    broker=REDIS_URL,
    backend=REDIS_RESULT_BACKEND,
    include=['src.tasks.algorithm_tasks']
)

# ============================================================================
# CONFIGURACIÓN AVANZADA PARA AWS Y ALTA DISPONIBILIDAD
# ============================================================================

celery_app.conf.update(
    # === CONFIGURACIÓN DE COLAS ===
    task_routes={
        'src.tasks.algorithm_tasks.execute_team_formation_algorithm': {
            'queue': 'algorithm_queue',
            'routing_key': 'algorithm.high_priority'
        },
        'src.tasks.algorithm_tasks.validate_algorithm_prerequisites': {
            'queue': 'validation_queue', 
            'routing_key': 'validation.standard'
        },
        'src.tasks.algorithm_tasks.cleanup_algorithm_resources': {
            'queue': 'cleanup_queue',
            'routing_key': 'cleanup.low_priority'
        }
    },
    
    # === EXCHANGES Y COLAS EMPRESARIALES ===
    task_default_queue='default',
    task_queues=(
        Queue('algorithm_queue', 
              Exchange('algorithm', type='direct'), 
              routing_key='algorithm.high_priority',
              queue_arguments={'x-max-priority': 10}),
        Queue('validation_queue',
              Exchange('validation', type='direct'),
              routing_key='validation.standard'),
        Queue('cleanup_queue',
              Exchange('cleanup', type='direct'),
              routing_key='cleanup.low_priority'),
    ),
    
    # === CONFIGURACIÓN DE RENDIMIENTO ===
    worker_concurrency=4,  # Ajustable según recursos AWS
    worker_max_tasks_per_child=50,  # Previene memory leaks
    worker_disable_rate_limits=True,
    
    # === CONFIGURACIÓN DE CONFIABILIDAD ===
    task_acks_late=True,  # Confirmación después de completar
    worker_prefetch_multiplier=1,  # Una tarea por worker a la vez
    task_reject_on_worker_lost=True,
    
    # === CONFIGURACIÓN DE TIMEOUTS ===
    task_soft_time_limit=300,  # 5 minutos soft timeout
    task_time_limit=600,       # 10 minutos hard timeout
    worker_send_task_events=True,
    
    # === CONFIGURACIÓN DE RESULTADOS ===
    result_expires=3600,  # Resultados expiran en 1 hora
    result_compression='gzip',
    task_compression='gzip',
    
    # === CONFIGURACIÓN DE MONITOREO ===
    worker_send_task_events=True,
    task_send_sent_event=True,
    task_track_started=True,
    
    # === CONFIGURACIÓN DE SERIALIZACIÓN ===
    task_serializer='json',
    accept_content=['json'],
    result_serializer='json',
    timezone='UTC',
    enable_utc=True,
    
    # === CONFIGURACIÓN DE RETRY INTELIGENTE ===
    task_default_retry_delay=60,  # 1 minuto entre reintentos
    task_max_retries=3,
    task_retry_backoff=True,
    task_retry_backoff_max=600,  # Máximo 10 minutos de backoff
    task_retry_jitter=True,      # Randomización para evitar thundering herd
    
    # === CONFIGURACIÓN AWS ESPECÍFICA ===
    broker_connection_retry=True,
    broker_connection_retry_on_startup=True,
    broker_connection_max_retries=10,
    
    # === CONFIGURACIÓN DE SEGURIDAD ===
    task_always_eager=False,  # False en producción para distribución real
    task_store_eager_result=True,
)

# ============================================================================
# CONFIGURACIÓN DE MONITOREO Y HEALTH CHECKS
# ============================================================================

@celery_app.task(bind=True, name='health_check')
def health_check_task(self):
    """
    Tarea de health check para monitoreo de infraestructura AWS
    """
    try:
        import psutil
        import time
        
        # Métricas del sistema
        cpu_percent = psutil.cpu_percent(interval=1)
        memory = psutil.virtual_memory()
        
        return {
            'status': 'healthy',
            'timestamp': time.time(),
            'worker_id': self.request.id,
            'metrics': {
                'cpu_percent': cpu_percent,
                'memory_percent': memory.percent,
                'memory_available_mb': memory.available / 1024 / 1024
            }
        }
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return {
            'status': 'unhealthy',
            'error': str(e),
            'timestamp': time.time()
        }

# ============================================================================
# CONFIGURACIÓN DE LOGGING AVANZADO
# ============================================================================

@celery_app.on_configure.connect
def configure_logging(sender, **kwargs):
    """
    Configuración de logging empresarial para CloudWatch/ELK Stack
    """
    import logging.config
    
    LOGGING_CONFIG = {
        'version': 1,
        'disable_existing_loggers': False,
        'formatters': {
            'detailed': {
                'format': '%(asctime)s [%(levelname)s] %(name)s.%(funcName)s:%(lineno)d - %(message)s'
            },
            'json': {
                'format': '{"timestamp": "%(asctime)s", "level": "%(levelname)s", "module": "%(name)s", "message": "%(message)s"}'
            }
        },
        'handlers': {
            'console': {
                'class': 'logging.StreamHandler',
                'level': 'INFO',
                'formatter': 'detailed',
                'stream': 'ext://sys.stdout'
            },
            'file': {
                'class': 'logging.handlers.RotatingFileHandler',
                'level': 'DEBUG',
                'formatter': 'json',
                'filename': 'logs/celery_worker.log',
                'maxBytes': 10485760,  # 10MB
                'backupCount': 5
            }
        },
        'loggers': {
            'celery': {
                'level': 'INFO',
                'handlers': ['console', 'file'],
                'propagate': False
            },
            'src.tasks': {
                'level': 'DEBUG',
                'handlers': ['console', 'file'],
                'propagate': False
            }
        },
        'root': {
            'level': 'WARNING',
            'handlers': ['console']
        }
    }
    
    # Crear directorio de logs si no existe
    os.makedirs('logs', exist_ok=True)
    logging.config.dictConfig(LOGGING_CONFIG)

# ============================================================================
# CONFIGURACIÓN DE SEÑALES PARA MONITOREO
# ============================================================================

@celery_app.on_task_prerun.connect
def task_prerun_handler(sender=None, task_id=None, task=None, args=None, kwargs=None, **kwds):
    """
    Handler ejecutado antes de iniciar una tarea
    Útil para logging y métricas en AWS CloudWatch
    """
    logger.info(f"🚀 [CELERY] Iniciando tarea: {task.name} (ID: {task_id})")

@celery_app.on_task_postrun.connect
def task_postrun_handler(sender=None, task_id=None, task=None, args=None, kwargs=None, retval=None, state=None, **kwds):
    """
    Handler ejecutado después de completar una tarea
    """
    logger.info(f"✅ [CELERY] Tarea completada: {task.name} (ID: {task_id}) - Estado: {state}")

@celery_app.on_task_failure.connect
def task_failure_handler(sender=None, task_id=None, exception=None, traceback=None, einfo=None, **kwds):
    """
    Handler ejecutado cuando una tarea falla
    """
    logger.error(f"💥 [CELERY] Tarea falló: {sender.name} (ID: {task_id}) - Error: {exception}")

# ============================================================================
# EXPORT DE LA APLICACIÓN
# ============================================================================

if __name__ == '__main__':
    logger.info("🚀 [CELERY] Iniciando aplicación Celery para TeamLens")
    celery_app.start() 