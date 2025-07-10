// ============================================================================
// TeamLens Backend - Celery Integration Service
// Servicio para integrar Node.js con Celery de manera asíncrona y robusta
// ============================================================================

import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../middlewares/logger';

// ============================================================================
// INTERFACES Y TIPOS
// ============================================================================

/**
 * Configuración de una tarea de Celery
 */
interface CeleryTaskConfig {
  taskName: string;
  args: any[];
  kwargs?: Record<string, any>;
  queue?: string;
  routingKey?: string;
  priority?: number;
  eta?: Date;
  expires?: Date;
  retries?: number;
  retryDelay?: number;
}

/**
 * Resultado de una tarea de Celery
 */
interface CeleryTaskResult {
  taskId: string;
  status: 'PENDING' | 'STARTED' | 'SUCCESS' | 'FAILURE' | 'RETRY' | 'REVOKED';
  result?: any;
  error?: string;
  traceback?: string;
  timestamp: Date;
}

/**
 * Estado de una tarea en el sistema
 */
interface TaskStatus {
  id: string;
  name: string;
  status: string;
  result?: any;
  error?: string;
  started_at?: Date;
  completed_at?: Date;
  execution_time?: number;
  retries: number;
  queue: string;
}

// ============================================================================
// SERVICIO PRINCIPAL DE CELERY
// ============================================================================

export class CeleryService {
  private redis: Redis;
  private resultBackend: Redis;
  private readonly defaultQueue: string = 'default';
  private readonly taskPrefix: string = 'celery-task-meta-';
  
  /**
   * Constructor del servicio de Celery
   */
  constructor() {
    // Configuración de Redis para broker de mensajes
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_BROKER_DB || '0'),
      maxRetriesPerRequest: 3,
      lazyConnect: true
    });

    // Configuración de Redis para resultados
    this.resultBackend = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_RESULT_DB || '1'),
      maxRetriesPerRequest: 3,
      lazyConnect: true
    });

    this.setupErrorHandlers();
  }

  /**
   * Configurar manejadores de errores para Redis
   */
  private setupErrorHandlers(): void {
    this.redis.on('error', (err: any) => {
      logger.error('❌ [CELERY] Redis broker error:', err);
    });

    this.redis.on('connect', () => {
      logger.info('✅ [CELERY] Redis broker connected');
    });

    this.resultBackend.on('error', (err: any) => {
      logger.error('❌ [CELERY] Redis result backend error:', err);
    });

    this.resultBackend.on('connect', () => {
      logger.info('✅ [CELERY] Redis result backend connected');
    });
  }

  /**
   * Conectar al sistema Redis
   */
  async connect(): Promise<void> {
    try {
      await Promise.all([
        this.redis.connect(),
        this.resultBackend.connect()
      ]);
      logger.info('🚀 [CELERY] Servicio de Celery conectado exitosamente');
    } catch (error) {
      logger.error('💥 [CELERY] Error conectando al servicio:', error);
      throw error;
    }
  }

  /**
   * Desconectar del sistema Redis
   */
  async disconnect(): Promise<void> {
    try {
      await Promise.all([
        this.redis.quit(),
        this.resultBackend.quit()
      ]);
      logger.info('🔌 [CELERY] Servicio de Celery desconectado');
    } catch (error) {
      logger.error('💥 [CELERY] Error desconectando:', error);
    }
  }

  // ============================================================================
  // MÉTODOS PARA ENVIAR TAREAS
  // ============================================================================

  /**
   * Envía una tarea al sistema de colas de Celery
   * @param config Configuración de la tarea
   * @returns ID de la tarea enviada
   */
  async sendTask(config: CeleryTaskConfig): Promise<string> {
    const taskId = uuidv4();
    const timestamp = new Date().toISOString();

    logger.info(`🚀 [CELERY] Enviando tarea: ${config.taskName} (ID: ${taskId})`);

    try {
      // Crear el mensaje de tarea según el protocolo de Celery
      const taskMessage = {
        id: taskId,
        task: config.taskName,
        args: config.args || [],
        kwargs: config.kwargs || {},
        retries: config.retries || 0,
        eta: config.eta?.toISOString(),
        expires: config.expires?.toISOString(),
        utc: true,
        callbacks: null,
        errbacks: null,
        timelimit: [300, 600], // [soft, hard] timeout
        taskset: null,
        chord: null,
        correlation_id: taskId,
        reply_to: taskId,
        origin: 'teamlens-nodejs-backend',
        delivery_info: {
          exchange: '',
          routing_key: config.queue || this.defaultQueue,
          priority: config.priority || 5
        }
      };

      // Crear headers del mensaje
      const headers = {
        lang: 'py',
        task: config.taskName,
        id: taskId,
        shadow: null,
        eta: config.eta?.toISOString(),
        expires: config.expires?.toISOString(),
        group: null,
        retries: config.retries || 0,
        timelimit: [300, 600],
        root_id: taskId,
        parent_id: null,
        argsrepr: JSON.stringify(config.args || []),
        kwargsrepr: JSON.stringify(config.kwargs || {}),
        origin: 'teamlens-nodejs-backend@' + require('os').hostname(),
        reply_to: taskId
      };

      // Crear el mensaje completo según formato Celery
      const celeryMessage = {
        body: Buffer.from(JSON.stringify([
          config.args || [],
          config.kwargs || {},
          {
            callbacks: null,
            errbacks: null,
            chain: null,
            chord: null
          }
        ])).toString('base64'),
        'content-type': 'application/json',
        'content-encoding': 'utf-8',
        headers: headers,
        properties: {
          correlation_id: taskId,
          reply_to: taskId,
          delivery_mode: 2,
          delivery_info: {
            exchange: '',
            routing_key: config.queue || this.defaultQueue
          },
          priority: config.priority || 5,
          body_encoding: 'base64'
        }
      };

      // Enviar mensaje a la cola de Redis
      const queueName = config.queue || this.defaultQueue;
      await this.redis.lpush(queueName, JSON.stringify(celeryMessage));

      // Registrar estado inicial en result backend
      await this.setTaskStatus(taskId, {
        id: taskId,
        name: config.taskName,
        status: 'PENDING',
        started_at: new Date(),
        retries: 0,
        queue: queueName
      });

      logger.info(`✅ [CELERY] Tarea enviada exitosamente: ${taskId} a cola: ${queueName}`);
      return taskId;

    } catch (error) {
      logger.error(`💥 [CELERY] Error enviando tarea ${config.taskName}:`, error);
      throw error;
    }
  }

  // ============================================================================
  // MÉTODOS ESPECÍFICOS PARA ALGORITMO DE FORMACIÓN DE GRUPOS
  // ============================================================================

  /**
   * Ejecuta el algoritmo de formación de grupos de manera asíncrona
   * @param activityId ID de la actividad
   * @param algorithmData Datos del algoritmo
   * @param orderedStudentIds IDs ordenados de estudiantes
   * @param metadata Metadatos adicionales
   * @returns ID de la tarea
   */
  async executeTeamFormationAlgorithm(
    activityId: string,
    algorithmData: any,
    orderedStudentIds: string[],
    metadata?: any
  ): Promise<string> {
    return this.sendTask({
      taskName: 'src.tasks.algorithm_tasks.execute_team_formation_algorithm',
      args: [activityId, algorithmData, orderedStudentIds],
      kwargs: { metadata },
      queue: 'algorithm_queue',
      routingKey: 'algorithm.high_priority',
      priority: 9,
      retries: 2,
      retryDelay: 60000 // 1 minuto
    });
  }

  /**
   * Valida prerrequisitos del algoritmo
   * @param activityId ID de la actividad
   * @returns ID de la tarea
   */
  async validateAlgorithmPrerequisites(activityId: string): Promise<string> {
    return this.sendTask({
      taskName: 'src.tasks.algorithm_tasks.validate_algorithm_prerequisites',
      args: [activityId],
      queue: 'validation_queue',
      routingKey: 'validation.standard',
      priority: 7
    });
  }

  /**
   * Ejecuta el workflow completo del algoritmo
   * @param activityId ID de la actividad
   * @param algorithmData Datos del algoritmo
   * @param orderedStudentIds IDs ordenados de estudiantes
   * @param workflowOptions Opciones del workflow
   * @returns ID de la tarea
   */
  async executeCompleteAlgorithmWorkflow(
    activityId: string,
    algorithmData: any,
    orderedStudentIds: string[],
    workflowOptions?: any
  ): Promise<string> {
    return this.sendTask({
      taskName: 'src.tasks.algorithm_tasks.execute_complete_algorithm_workflow',
      args: [activityId, algorithmData, orderedStudentIds],
      kwargs: { workflow_options: workflowOptions },
      queue: 'algorithm_queue',
      routingKey: 'algorithm.high_priority',
      priority: 10,
      retries: 1
    });
  }

  /**
   * Limpia recursos del algoritmo
   * @param activityId ID de la actividad
   * @param cleanupOptions Opciones de limpieza
   * @returns ID de la tarea
   */
  async cleanupAlgorithmResources(
    activityId: string,
    cleanupOptions?: any
  ): Promise<string> {
    return this.sendTask({
      taskName: 'src.tasks.algorithm_tasks.cleanup_algorithm_resources',
      args: [activityId],
      kwargs: { cleanup_options: cleanupOptions },
      queue: 'cleanup_queue',
      routingKey: 'cleanup.low_priority',
      priority: 3
    });
  }

  // ============================================================================
  // MÉTODOS PARA MONITOREO Y GESTIÓN DE TAREAS
  // ============================================================================

  /**
   * Obtiene el estado de una tarea
   * @param taskId ID de la tarea
   * @returns Estado de la tarea
   */
  async getTaskStatus(taskId: string): Promise<TaskStatus | null> {
    try {
      const key = `${this.taskPrefix}${taskId}`;
      const rawResult = await this.resultBackend.get(key);
      
      if (!rawResult) {
        return null;
      }

      const result = JSON.parse(rawResult);
      return {
        id: taskId,
        name: result.task_name || 'unknown',
        status: result.status || 'PENDING',
        result: result.result,
        error: result.error,
        started_at: result.started_at ? new Date(result.started_at) : undefined,
        completed_at: result.completed_at ? new Date(result.completed_at) : undefined,
        execution_time: result.execution_time,
        retries: result.retries || 0,
        queue: result.queue || 'unknown'
      };
    } catch (error) {
      logger.error(`💥 [CELERY] Error obteniendo estado de tarea ${taskId}:`, error);
      return null;
    }
  }

  /**
   * Establece el estado de una tarea
   * @param taskId ID de la tarea
   * @param status Estado a establecer
   */
  async setTaskStatus(taskId: string, status: TaskStatus): Promise<void> {
    try {
      const key = `${this.taskPrefix}${taskId}`;
      const value = {
        task_name: status.name,
        status: status.status,
        result: status.result,
        error: status.error,
        started_at: status.started_at?.toISOString(),
        completed_at: status.completed_at?.toISOString(),
        execution_time: status.execution_time,
        retries: status.retries,
        queue: status.queue
      };

      await this.resultBackend.setex(key, 3600, JSON.stringify(value)); // Expira en 1 hora
    } catch (error) {
      logger.error(`💥 [CELERY] Error estableciendo estado de tarea ${taskId}:`, error);
    }
  }

  /**
   * Espera a que una tarea se complete
   * @param taskId ID de la tarea
   * @param timeoutMs Timeout en milisegundos (default: 10 minutos)
   * @param pollIntervalMs Intervalo de polling en milisegundos (default: 5 segundos)
   * @returns Resultado de la tarea
   */
  async waitForTask(
    taskId: string, 
    timeoutMs: number = 10 * 60 * 1000,
    pollIntervalMs: number = 5000
  ): Promise<TaskStatus> {
    const startTime = Date.now();
    
    logger.info(`⏳ [CELERY] Esperando tarea: ${taskId} (timeout: ${timeoutMs/1000}s)`);

    return new Promise((resolve, reject) => {
      const checkStatus = async () => {
        try {
          const status = await this.getTaskStatus(taskId);
          
          if (!status) {
            if (Date.now() - startTime > timeoutMs) {
              reject(new Error(`Timeout esperando tarea ${taskId}`));
              return;
            }
            setTimeout(checkStatus, pollIntervalMs);
            return;
          }

          // Estados finales
          if (status.status === 'SUCCESS') {
            logger.info(`✅ [CELERY] Tarea completada exitosamente: ${taskId}`);
            resolve(status);
          } else if (status.status === 'FAILURE') {
            logger.error(`💥 [CELERY] Tarea falló: ${taskId} - ${status.error}`);
            reject(new Error(`Tarea falló: ${status.error}`));
          } else if (status.status === 'REVOKED') {
            logger.warn(`⚠️ [CELERY] Tarea revocada: ${taskId}`);
            reject(new Error(`Tarea revocada: ${taskId}`));
          } else {
            // Estados intermedios: PENDING, STARTED, RETRY
            if (Date.now() - startTime > timeoutMs) {
              reject(new Error(`Timeout esperando tarea ${taskId}`));
              return;
            }
            
            // Log progreso cada minuto
            if ((Date.now() - startTime) % 60000 < pollIntervalMs) {
              const elapsed = Math.round((Date.now() - startTime) / 1000);
              logger.info(`⏱️ [CELERY] Tarea ${taskId} - Estado: ${status.status} - Tiempo: ${elapsed}s`);
            }
            
            setTimeout(checkStatus, pollIntervalMs);
          }
        } catch (error) {
          logger.error(`💥 [CELERY] Error verificando estado de tarea ${taskId}:`, error);
          reject(error);
        }
      };

      // Iniciar verificación
      setTimeout(checkStatus, 100);
    });
  }

  /**
   * Revoca (cancela) una tarea
   * @param taskId ID de la tarea
   * @param terminate Si terminar inmediatamente o esperar a que termine la iteración actual
   */
  async revokeTask(taskId: string, terminate: boolean = false): Promise<void> {
    try {
      logger.info(`🛑 [CELERY] Revocando tarea: ${taskId} (terminate: ${terminate})`);
      
      // Enviar comando de revocación
      const revokeMessage = {
        command: 'revoke',
        arguments: {
          task_id: taskId,
          terminate: terminate,
          signal: terminate ? 'SIGTERM' : null
        }
      };

      await this.redis.publish('celery.pidbox_broadcast', JSON.stringify(revokeMessage));
      
      // Actualizar estado en result backend
      await this.setTaskStatus(taskId, {
        id: taskId,
        name: 'revoked',
        status: 'REVOKED',
        completed_at: new Date(),
        retries: 0,
        queue: 'unknown'
      });

      logger.info(`✅ [CELERY] Tarea revocada: ${taskId}`);
    } catch (error) {
      logger.error(`💥 [CELERY] Error revocando tarea ${taskId}:`, error);
      throw error;
    }
  }

  /**
   * Obtiene estadísticas de las colas
   * @returns Estadísticas de las colas
   */
  async getQueueStats(): Promise<Record<string, number>> {
    try {
      const queues = ['algorithm_queue', 'validation_queue', 'cleanup_queue', 'default'];
      const stats: Record<string, number> = {};

      for (const queue of queues) {
        const length = await this.redis.llen(queue);
        stats[queue] = length;
      }

      return stats;
    } catch (error) {
      logger.error('💥 [CELERY] Error obteniendo estadísticas de colas:', error);
      return {};
    }
  }

  /**
   * Verifica si el servicio está saludable
   * @returns true si el servicio está funcionando correctamente
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Verificar conectividad con Redis broker
      await this.redis.ping();
      
      // Verificar conectividad con result backend
      await this.resultBackend.ping();
      
      // Enviar tarea de health check
      const healthTaskId = await this.sendTask({
        taskName: 'health_check',
        args: [],
        queue: 'default',
        priority: 1
      });
      
      // Esperar resultado con timeout corto
      const result = await this.waitForTask(healthTaskId, 30000, 1000);
      
      return result.status === 'SUCCESS';
    } catch (error) {
      logger.error('💥 [CELERY] Health check falló:', error);
      return false;
    }
  }
}

// ============================================================================
// INSTANCIA SINGLETON
// ============================================================================

export const celeryService = new CeleryService(); 