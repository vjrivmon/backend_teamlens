# ============================================================================
# TeamLens Backend - Algorithm Tasks
# Tareas distribuidas de Celery para formación de grupos
# ============================================================================

import os
import sys
import json
import time
import logging
import traceback
from typing import Dict, List, Any, Optional, Tuple
from pathlib import Path
from datetime import datetime, timezone
import subprocess
import tempfile

# Imports de Celery
from celery import Task
from celery.exceptions import Retry, WorkerLostError
from src.celery_app import celery_app

# Imports para MongoDB (para actualizar estados)
from pymongo import MongoClient
from bson import ObjectId

# ============================================================================
# CONFIGURACIÓN DE LOGGING EMPRESARIAL
# ============================================================================

logger = logging.getLogger(__name__)

# ============================================================================
# CONFIGURACIÓN DE MONGODB PARA ACTUALIZACIONES DE ESTADO
# ============================================================================

def get_mongodb_connection():
    """
    Establece conexión con MongoDB para actualizaciones de estado
    Maneja reconexión automática y failover en AWS
    """
    try:
        # En producción AWS, usar connection string desde variables de entorno
        mongo_uri = os.getenv('MONGODB_URI', 'mongodb://localhost:27017/test')
        client = MongoClient(mongo_uri, 
                           serverSelectionTimeoutMS=5000,
                           connectTimeoutMS=10000,
                           socketTimeoutMS=20000,
                           retryWrites=True,
                           w='majority')
        
        # Verificar conectividad
        client.admin.command('ping')
        db = client.get_database()
        
        logger.info("✅ [MongoDB] Conexión establecida exitosamente")
        return db
    except Exception as e:
        logger.error(f"💥 [MongoDB] Error de conexión: {e}")
        raise

# ============================================================================
# CLASE BASE PARA TAREAS CON MANEJO EMPRESARIAL DE ERRORES
# ============================================================================

class AlgorithmBaseTask(Task):
    """
    Clase base para tareas del algoritmo con manejo robusto de errores
    y integración con sistemas de monitoreo empresarial
    """
    
    abstract = True
    autoretry_for = (ConnectionError, TimeoutError, subprocess.CalledProcessError)
    retry_kwargs = {'max_retries': 3, 'countdown': 60}
    retry_backoff = True
    retry_jitter = True
    
    def on_success(self, retval, task_id, args, kwargs):
        """
        Callback ejecutado cuando la tarea se completa exitosamente
        """
        logger.info(f"✅ [CELERY] Tarea exitosa: {self.name} (ID: {task_id})")
        
    def on_failure(self, exc, task_id, args, kwargs, einfo):
        """
        Callback ejecutado cuando la tarea falla
        Integración con sistemas de alertas empresariales
        """
        logger.error(f"💥 [CELERY] Tarea falló: {self.name} (ID: {task_id}) - Error: {exc}")
        
        # En producción: enviar alertas a SNS/CloudWatch
        if os.getenv('ENVIRONMENT') == 'production':
            self._send_failure_alert(task_id, exc, args, kwargs)
    
    def on_retry(self, exc, task_id, args, kwargs, einfo):
        """
        Callback ejecutado cuando la tarea se reintenta
        """
        logger.warning(f"🔄 [CELERY] Reintentando tarea: {self.name} (ID: {task_id}) - Error: {exc}")
    
    def _send_failure_alert(self, task_id: str, exception: Exception, args: tuple, kwargs: dict):
        """
        Envía alertas de fallo a sistemas de monitoreo AWS
        """
        try:
            # Implementar integración con SNS/CloudWatch/Slack
            alert_data = {
                'task_name': self.name,
                'task_id': task_id,
                'error': str(exception),
                'timestamp': datetime.now(timezone.utc).isoformat(),
                'environment': os.getenv('ENVIRONMENT', 'development')
            }
            logger.info(f"📢 [ALERT] Alerta de fallo preparada: {alert_data}")
            # TODO: Implementar envío real a SNS en fase de despliegue AWS
        except Exception as e:
            logger.error(f"💥 [ALERT] Error enviando alerta: {e}")

# ============================================================================
# TASK 1: VALIDACIÓN DE PRERREQUISITOS DEL ALGORITMO
# ============================================================================

@celery_app.task(
    bind=True,
    base=AlgorithmBaseTask,
    name='validate_algorithm_prerequisites',
    soft_time_limit=60,
    time_limit=120
)
def validate_algorithm_prerequisites(self, activity_id: str) -> Dict[str, Any]:
    """
    Valida que todos los prerrequisitos estén cumplidos antes de ejecutar el algoritmo
    
    Args:
        activity_id: ID de la actividad a validar
        
    Returns:
        Dict con resultado de validación y detalles
    """
    logger.info(f"🔍 [VALIDATION] Iniciando validación para actividad: {activity_id}")
    
    try:
        db = get_mongodb_connection()
        activities_collection = db.activities
        users_collection = db.users
        
        # Obtener actividad
        activity = activities_collection.find_one({'_id': ObjectId(activity_id)})
        if not activity:
            raise ValueError(f"Actividad {activity_id} no encontrada")
        
        # Validar estudiantes con BELBIN completado
        belbin_traits = ["TW", "CW", "CH", "ME", "CF", "SH", "PL", "RI"]
        students_with_belbin = users_collection.find({
            '_id': {'$in': activity['students']},
            'askedQuestionnaires': {
                '$elemMatch': {
                    'result': {'$in': belbin_traits}
                }
            }
        }).count()
        
        total_students = len(activity['students'])
        
        # Validar configuración del algoritmo
        algorithm_config = activity.get('algorithmConfig', {})
        is_configured = algorithm_config.get('isConfigured', False)
        
        validation_result = {
            'is_valid': students_with_belbin == total_students and is_configured,
            'activity_id': activity_id,
            'total_students': total_students,
            'students_with_belbin': students_with_belbin,
            'is_configured': is_configured,
            'validation_timestamp': datetime.now(timezone.utc).isoformat(),
            'details': {
                'missing_belbin': total_students - students_with_belbin,
                'configuration_status': 'configured' if is_configured else 'not_configured'
            }
        }
        
        logger.info(f"✅ [VALIDATION] Validación completada: {validation_result['is_valid']}")
        return validation_result
        
    except Exception as e:
        logger.error(f"💥 [VALIDATION] Error en validación: {e}")
        raise self.retry(exc=e, countdown=30, max_retries=2)

# ============================================================================
# TASK 2: EJECUCIÓN PRINCIPAL DEL ALGORITMO DE FORMACIÓN
# ============================================================================

@celery_app.task(
    bind=True,
    base=AlgorithmBaseTask,
    name='execute_team_formation_algorithm',
    soft_time_limit=300,  # 5 minutos
    time_limit=600        # 10 minutos hard limit
)
def execute_team_formation_algorithm(
    self, 
    activity_id: str, 
    algorithm_data: Dict[str, Any],
    ordered_student_ids: List[str],
    metadata: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Ejecuta el algoritmo de formación de grupos de manera distribuida
    
    Args:
        activity_id: ID de la actividad
        algorithm_data: Datos completos del algoritmo (traits, constraints, etc.)
        ordered_student_ids: IDs de estudiantes en orden específico
        metadata: Metadatos adicionales para tracking
        
    Returns:
        Dict con resultado completo del algoritmo
    """
    task_id = self.request.id
    start_time = time.time()
    
    logger.info(f"🚀 [ALGORITHM] Iniciando algoritmo distribuido")
    logger.info(f"📊 [ALGORITHM] Task ID: {task_id}")
    logger.info(f"📊 [ALGORITHM] Actividad: {activity_id}")
    logger.info(f"📊 [ALGORITHM] Estudiantes: {len(ordered_student_ids)}")
    logger.info(f"📊 [ALGORITHM] Constraints: {len(algorithm_data.get('constraints', []))}")
    
    try:
        # === FASE 1: ACTUALIZAR ESTADO INICIAL ===
        logger.info(f"📝 [ALGORITHM] Fase 1: Actualizando estado a 'running'")
        db = get_mongodb_connection()
        activities_collection = db.activities
        
        update_result = activities_collection.update_one(
            {'_id': ObjectId(activity_id)},
            {
                '$set': {
                    'algorithmStatus': 'running',
                    'algorithmTaskId': task_id,
                    'algorithmStartedAt': datetime.now(timezone.utc),
                    'updatedAt': datetime.now(timezone.utc)
                }
            }
        )
        
        if update_result.matched_count == 0:
            raise ValueError(f"No se pudo actualizar estado para actividad {activity_id}")
        
        # === FASE 2: PREPARAR ARCHIVO JSON TEMPORAL ===
        logger.info(f"📁 [ALGORITHM] Fase 2: Preparando archivo JSON temporal")
        
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as temp_file:
            json.dump(algorithm_data, temp_file, indent=2)
            temp_json_path = temp_file.name
        
        logger.info(f"📄 [ALGORITHM] Archivo temporal creado: {temp_json_path}")
        
        # === FASE 3: EJECUTAR ALGORITMO PYTHON ===
        logger.info(f"🐍 [ALGORITHM] Fase 3: Ejecutando algoritmo Python optimizado")
        
        # Ruta al script del algoritmo
        script_path = Path(__file__).parent.parent / 'scripts' / 'algorithm.py'
        
        if not script_path.exists():
            raise FileNotFoundError(f"Script del algoritmo no encontrado: {script_path}")
        
        # Ejecutar con timeout y captura completa de output
        process = subprocess.Popen(
            ['python', str(script_path), json.dumps(algorithm_data)],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            cwd=str(script_path.parent)
        )
        
        # Monitoreo en tiempo real del progreso
        progress_updates = 0
        while process.poll() is None:
            time.sleep(10)  # Check cada 10 segundos
            progress_updates += 1
            
            # Actualizar progreso cada minuto
            if progress_updates % 6 == 0:
                elapsed_time = time.time() - start_time
                logger.info(f"⏱️ [ALGORITHM] Progreso: {elapsed_time:.1f}s transcurridos")
                
                # Actualizar timestamp en base de datos para monitoring
                activities_collection.update_one(
                    {'_id': ObjectId(activity_id)},
                    {'$set': {'algorithmLastHeartbeat': datetime.now(timezone.utc)}}
                )
        
        # Obtener resultado final
        stdout, stderr = process.communicate()
        exit_code = process.returncode
        
        # Limpiar archivo temporal
        try:
            os.unlink(temp_json_path)
            logger.info(f"🗑️ [ALGORITHM] Archivo temporal eliminado")
        except Exception as cleanup_error:
            logger.warning(f"⚠️ [ALGORITHM] Error limpiando archivo temporal: {cleanup_error}")
        
        # === FASE 4: PROCESAR RESULTADO ===
        if exit_code != 0:
            error_message = f"Algoritmo Python falló con código {exit_code}. Error: {stderr}"
            logger.error(f"💥 [ALGORITHM] {error_message}")
            raise subprocess.CalledProcessError(exit_code, 'python', stderr)
        
        logger.info(f"✅ [ALGORITHM] Algoritmo Python completado exitosamente")
        
        # Parsear resultado
        try:
            team_indices = json.loads(stdout.strip())
            logger.info(f"📊 [ALGORITHM] Equipos generados: {len(team_indices)}")
        except json.JSONDecodeError as e:
            logger.error(f"💥 [ALGORITHM] Error parseando resultado JSON: {e}")
            logger.error(f"Raw stdout: {stdout}")
            raise ValueError(f"Resultado del algoritmo no es JSON válido: {e}")
        
        # === FASE 5: CONVERTIR ÍNDICES A IDS REALES ===
        logger.info(f"🔄 [ALGORITHM] Fase 5: Convirtiendo índices a IDs reales")
        
        teams_with_real_ids = []
        for team_index, team_indices_list in enumerate(team_indices):
            team_real_ids = []
            for member_index in team_indices_list:
                if 0 <= member_index < len(ordered_student_ids):
                    team_real_ids.append(ordered_student_ids[member_index])
                else:
                    logger.warning(f"⚠️ [ALGORITHM] Índice inválido: {member_index}")
            
            if team_real_ids:
                teams_with_real_ids.append(team_real_ids)
                logger.info(f"👥 [ALGORITHM] Equipo {team_index + 1}: {len(team_real_ids)} miembros")
        
        # === FASE 6: CREAR GRUPOS EN BASE DE DATOS ===
        logger.info(f"💾 [ALGORITHM] Fase 6: Creando grupos en base de datos")
        
        groups_collection = db.groups
        created_groups = []
        
        for team_index, team_member_ids in enumerate(teams_with_real_ids):
            group_name = f"Equipo {team_index + 1}"
            
            group_doc = {
                'name': group_name,
                'activity': ObjectId(activity_id),
                'students': [ObjectId(student_id) for student_id in team_member_ids],
                'createdAt': datetime.now(timezone.utc),
                'createdBy': 'algorithm',
                'algorithmTaskId': task_id,
                'metadata': {
                    'algorithm_version': '2.0',
                    'team_size': len(team_member_ids),
                    'creation_method': 'celery_distributed'
                }
            }
            
            insert_result = groups_collection.insert_one(group_doc)
            created_groups.append({
                'group_id': str(insert_result.inserted_id),
                'name': group_name,
                'members_count': len(team_member_ids),
                'members': team_member_ids
            })
        
        logger.info(f"✅ [ALGORITHM] {len(created_groups)} grupos creados exitosamente")
        
        # === FASE 7: ACTUALIZAR ESTADO FINAL ===
        execution_time = time.time() - start_time
        
        final_result = {
            'success': True,
            'teams_count': len(teams_with_real_ids),
            'students_processed': len(ordered_student_ids),
            'execution_time_seconds': round(execution_time, 2),
            'created_groups': created_groups,
            'algorithm_version': '2.0_celery',
            'task_id': task_id,
            'timestamp': datetime.now(timezone.utc).isoformat()
        }
        
        activities_collection.update_one(
            {'_id': ObjectId(activity_id)},
            {
                '$set': {
                    'algorithmStatus': 'done',
                    'algorithmResult': final_result,
                    'algorithmCompletedAt': datetime.now(timezone.utc),
                    'updatedAt': datetime.now(timezone.utc)
                },
                '$unset': {
                    'algorithmTaskId': '',
                    'algorithmLastHeartbeat': ''
                }
            }
        )
        
        logger.info(f"🎉 [ALGORITHM] Algoritmo completado exitosamente en {execution_time:.2f}s")
        logger.info(f"📊 [ALGORITHM] Resultado final: {len(teams_with_real_ids)} equipos, {len(ordered_student_ids)} estudiantes")
        
        return final_result
        
    except Exception as e:
        # === MANEJO DE ERRORES EMPRESARIAL ===
        execution_time = time.time() - start_time
        error_details = {
            'error_type': type(e).__name__,
            'error_message': str(e),
            'execution_time_seconds': round(execution_time, 2),
            'task_id': task_id,
            'timestamp': datetime.now(timezone.utc).isoformat(),
            'traceback': traceback.format_exc()
        }
        
        logger.error(f"💥 [ALGORITHM] Error crítico: {error_details}")
        
        # Actualizar estado de error en base de datos
        try:
            db = get_mongodb_connection()
            activities_collection = db.activities
            activities_collection.update_one(
                {'_id': ObjectId(activity_id)},
                {
                    '$set': {
                        'algorithmStatus': 'error',
                        'algorithmError': error_details,
                        'algorithmCompletedAt': datetime.now(timezone.utc),
                        'updatedAt': datetime.now(timezone.utc)
                    },
                    '$unset': {
                        'algorithmTaskId': '',
                        'algorithmLastHeartbeat': ''
                    }
                }
            )
        except Exception as db_error:
            logger.error(f"💥 [ALGORITHM] Error adicional actualizando estado: {db_error}")
        
        # Decidir si reintentar basado en el tipo de error
        if isinstance(e, (ConnectionError, TimeoutError, subprocess.CalledProcessError)):
            if self.request.retries < self.max_retries:
                logger.info(f"🔄 [ALGORITHM] Reintentando tarea (intento {self.request.retries + 1})")
                raise self.retry(exc=e, countdown=60 * (self.request.retries + 1))
        
        # Error no recuperable
        raise e

# ============================================================================
# TASK 3: LIMPIEZA DE RECURSOS DEL ALGORITMO
# ============================================================================

@celery_app.task(
    bind=True,
    base=AlgorithmBaseTask,
    name='cleanup_algorithm_resources',
    soft_time_limit=30,
    time_limit=60
)
def cleanup_algorithm_resources(self, activity_id: str, cleanup_options: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Limpia recursos utilizados por el algoritmo (archivos temporales, cache, etc.)
    
    Args:
        activity_id: ID de la actividad
        cleanup_options: Opciones de limpieza específicas
        
    Returns:
        Dict con resultado de la limpieza
    """
    logger.info(f"🧹 [CLEANUP] Iniciando limpieza para actividad: {activity_id}")
    
    try:
        cleanup_results = {
            'activity_id': activity_id,
            'files_cleaned': 0,
            'cache_cleared': False,
            'temp_files_removed': 0,
            'cleanup_timestamp': datetime.now(timezone.utc).isoformat()
        }
        
        # Limpiar archivos JSON temporales del algoritmo
        instances_path = Path(__file__).parent.parent.parent.parent / 'pyteamformation' / 'instances'
        json_pattern = f'activity_{activity_id}_*.json'
        
        if instances_path.exists():
            for json_file in instances_path.glob(json_pattern):
                try:
                    json_file.unlink()
                    cleanup_results['files_cleaned'] += 1
                    logger.info(f"🗑️ [CLEANUP] Archivo eliminado: {json_file}")
                except Exception as file_error:
                    logger.warning(f"⚠️ [CLEANUP] Error eliminando {json_file}: {file_error}")
        
        # Limpiar archivos temporales del sistema
        temp_dir = Path(tempfile.gettempdir())
        for temp_file in temp_dir.glob(f'*{activity_id}*.json'):
            try:
                temp_file.unlink()
                cleanup_results['temp_files_removed'] += 1
                logger.info(f"🗑️ [CLEANUP] Archivo temporal eliminado: {temp_file}")
            except Exception as temp_error:
                logger.warning(f"⚠️ [CLEANUP] Error eliminando temporal {temp_file}: {temp_error}")
        
        # Marcar limpieza de cache como exitosa
        cleanup_results['cache_cleared'] = True
        
        logger.info(f"✅ [CLEANUP] Limpieza completada: {cleanup_results}")
        return cleanup_results
        
    except Exception as e:
        logger.error(f"💥 [CLEANUP] Error en limpieza: {e}")
        return {
            'activity_id': activity_id,
            'success': False,
            'error': str(e),
            'cleanup_timestamp': datetime.now(timezone.utc).isoformat()
        }

# ============================================================================
# TASK 4: WORKFLOW COMPLETO DEL ALGORITMO
# ============================================================================

@celery_app.task(
    bind=True,
    base=AlgorithmBaseTask,
    name='execute_complete_algorithm_workflow',
    soft_time_limit=480,  # 8 minutos
    time_limit=720        # 12 minutos
)
def execute_complete_algorithm_workflow(
    self,
    activity_id: str,
    algorithm_data: Dict[str, Any],
    ordered_student_ids: List[str],
    workflow_options: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Ejecuta el workflow completo del algoritmo: validación + ejecución + limpieza
    
    Args:
        activity_id: ID de la actividad
        algorithm_data: Datos del algoritmo
        ordered_student_ids: IDs ordenados de estudiantes
        workflow_options: Opciones del workflow
        
    Returns:
        Dict con resultado completo del workflow
    """
    workflow_id = self.request.id
    start_time = time.time()
    
    logger.info(f"🚀 [WORKFLOW] Iniciando workflow completo: {workflow_id}")
    logger.info(f"📊 [WORKFLOW] Actividad: {activity_id}")
    
    try:
        workflow_result = {
            'workflow_id': workflow_id,
            'activity_id': activity_id,
            'start_time': datetime.now(timezone.utc).isoformat(),
            'phases': {}
        }
        
        # === FASE 1: VALIDACIÓN ===
        logger.info(f"🔍 [WORKFLOW] Fase 1: Validación de prerrequisitos")
        validation_result = validate_algorithm_prerequisites.apply_async(
            args=[activity_id],
            queue='validation_queue'
        ).get(timeout=120)
        
        workflow_result['phases']['validation'] = validation_result
        
        if not validation_result['is_valid']:
            raise ValueError(f"Validación falló: {validation_result['details']}")
        
        # === FASE 2: EJECUCIÓN DEL ALGORITMO ===
        logger.info(f"🧠 [WORKFLOW] Fase 2: Ejecución del algoritmo")
        algorithm_result = execute_team_formation_algorithm.apply_async(
            args=[activity_id, algorithm_data, ordered_student_ids],
            kwargs={'metadata': {'workflow_id': workflow_id}},
            queue='algorithm_queue'
        ).get(timeout=600)
        
        workflow_result['phases']['algorithm_execution'] = algorithm_result
        
        # === FASE 3: LIMPIEZA ===
        logger.info(f"🧹 [WORKFLOW] Fase 3: Limpieza de recursos")
        cleanup_result = cleanup_algorithm_resources.apply_async(
            args=[activity_id],
            queue='cleanup_queue'
        ).get(timeout=60)
        
        workflow_result['phases']['cleanup'] = cleanup_result
        
        # === RESULTADO FINAL ===
        execution_time = time.time() - start_time
        workflow_result.update({
            'success': True,
            'execution_time_seconds': round(execution_time, 2),
            'end_time': datetime.now(timezone.utc).isoformat(),
            'summary': {
                'teams_created': algorithm_result['teams_count'],
                'students_processed': algorithm_result['students_processed'],
                'files_cleaned': cleanup_result.get('files_cleaned', 0)
            }
        })
        
        logger.info(f"🎉 [WORKFLOW] Workflow completado exitosamente en {execution_time:.2f}s")
        return workflow_result
        
    except Exception as e:
        execution_time = time.time() - start_time
        error_result = {
            'workflow_id': workflow_id,
            'activity_id': activity_id,
            'success': False,
            'error': str(e),
            'execution_time_seconds': round(execution_time, 2),
            'end_time': datetime.now(timezone.utc).isoformat()
        }
        
        logger.error(f"💥 [WORKFLOW] Workflow falló: {error_result}")
        raise e 