// ============================================================================
// TeamLens Backend - Activity Router with Celery Integration
// Router actualizado para usar el sistema de colas distribuido con Celery
// ============================================================================

import { Request, Response, Router } from "express";
import { ObjectId } from "mongodb";
import { collections } from "../services/database.service";
import verifyTeacher from "../middlewares/verify-teacher";
import { celeryService } from "../services/celery.service";
import { addUserNotification } from "../functions/user-functions";
import { logger } from "../middlewares/logger";

// ============================================================================
// ROUTER SETUP
// ============================================================================

export const activitiesCeleryRouter = Router();

// ============================================================================
// ENDPOINT PRINCIPAL - EJECUCIÓN CON CELERY
// ============================================================================

/**
 * Endpoint para ejecutar el algoritmo de formación de equipos usando Celery
 * NUEVA IMPLEMENTACIÓN: Sistema distribuido y escalable para AWS
 * @route POST /activities/:id/algorithm/execute-celery
 * @param {string} id - ID de la actividad
 * @param {Object} req.body - Datos del algoritmo desde el frontend
 * @returns {Object} Respuesta inmediata con task_id para tracking asíncrono
 */
activitiesCeleryRouter.post("/:id/algorithm/execute-celery", verifyTeacher, async (req: Request, res: Response) => {
    const activityId = req?.params?.id;
    const frontendData = req?.body;
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    logger.info(`🚀 [CELERY-ALGORITHM] ==========================================`);
    logger.info(`🚀 [CELERY-ALGORITHM] INICIANDO EJECUCIÓN DISTRIBUIDA`);
    logger.info(`🚀 [CELERY-ALGORITHM] Request ID: ${requestId}`);
    logger.info(`🚀 [CELERY-ALGORITHM] Actividad: ${activityId}`);
    logger.info(`🚀 [CELERY-ALGORITHM] Profesor: ${(req.session as any)?.authuser}`);
    logger.info(`🚀 [CELERY-ALGORITHM] Timestamp: ${new Date().toISOString()}`);
    logger.info(`🚀 [CELERY-ALGORITHM] ==========================================`);

    try {
        // === FASE 1: VALIDACIÓN DE ACTIVIDAD ===
        logger.info(`🔍 [CELERY-ALGORITHM] Fase 1: Validando actividad y permisos...`);
        
        const activity = await collections.activities?.findOne({ 
            _id: new ObjectId(activityId),
            teacher: new ObjectId(req.session?.authuser as string)
        });
        
        if (!activity) {
            logger.error(`❌ [CELERY-ALGORITHM] Actividad no encontrada o sin permisos: ${activityId}`);
            return res.status(404).json({
                success: false,
                error: 'ACTIVITY_NOT_FOUND',
                message: `Activity ${activityId} not found or insufficient permissions`,
                requestId
            });
        }
        
        logger.info(`✅ [CELERY-ALGORITHM] Actividad validada: "${activity.title}"`);
        logger.info(`📊 [CELERY-ALGORITHM] Estudiantes en actividad: ${activity.students?.length || 0}`);

        // === FASE 2: VALIDACIÓN DE DATOS DEL FRONTEND ===
        logger.info(`🔍 [CELERY-ALGORITHM] Fase 2: Validando datos del frontend...`);
        
        const { algorithmData, selectedStudentIds, groupConfigurations, restrictions } = frontendData;
        
        if (!algorithmData || !selectedStudentIds || selectedStudentIds.length === 0) {
            logger.error(`❌ [CELERY-ALGORITHM] Datos de frontend incompletos`);
            return res.status(400).json({
                success: false,
                error: 'INVALID_INPUT_DATA',
                message: "Missing or invalid algorithm data from frontend",
                details: {
                    hasAlgorithmData: !!algorithmData,
                    selectedStudentsCount: selectedStudentIds?.length || 0
                },
                requestId
            });
        }
        
        logger.info(`✅ [CELERY-ALGORITHM] Datos del frontend validados:`);
        logger.info(`📊 [CELERY-ALGORITHM] - Estudiantes seleccionados: ${selectedStudentIds.length}`);
        logger.info(`📊 [CELERY-ALGORITHM] - Constraints iniciales: ${algorithmData.constraints?.length || 0}`);

        // === FASE 3: VERIFICACIÓN DE ESTADO DEL ALGORITMO ===
        logger.info(`🔍 [CELERY-ALGORITHM] Fase 3: Verificando estado actual...`);
        
        if (activity.algorithmStatus === 'running') {
            logger.warn(`⚠️ [CELERY-ALGORITHM] Algoritmo ya en ejecución para actividad: ${activityId}`);
            
            // Verificar si hay una tarea activa en Celery
            const currentTaskId = activity.algorithmTaskId;
            if (currentTaskId) {
                const taskStatus = await celeryService.getTaskStatus(currentTaskId);
                if (taskStatus && ['PENDING', 'STARTED'].includes(taskStatus.status)) {
                    return res.status(409).json({
                        success: false,
                        error: 'ALGORITHM_ALREADY_RUNNING',
                        message: 'Algorithm is already running for this activity',
                        currentTaskId: currentTaskId,
                        taskStatus: taskStatus.status,
                        requestId
                    });
                }
            }
        }

        // === FASE 4: PROCESAMIENTO DE ESTUDIANTES Y TRAITS ===
        logger.info(`🔍 [CELERY-ALGORITHM] Fase 4: Procesando estudiantes con BELBIN...`);
        
        const selectedStudentObjectIds = selectedStudentIds.map((id: string) => new ObjectId(id));
        
        // Obtener estudiantes con traits BELBIN
        const studentsWithBelbin = await collections.users?.find({
            _id: { $in: selectedStudentObjectIds },
            "askedQuestionnaires": {
                $elemMatch: {
                    "result": { $in: ["TW", "CW", "CH", "ME", "CF", "SH", "PL", "RI"] }
                }
            }
        }).toArray();

        if (!studentsWithBelbin || studentsWithBelbin.length === 0) {
            logger.error(`❌ [CELERY-ALGORITHM] No hay estudiantes con BELBIN válido`);
            return res.status(400).json({
                success: false,
                error: 'NO_BELBIN_RESULTS',
                message: "No selected students have completed BELBIN questionnaire",
                selectedCount: selectedStudentIds.length,
                requestId
            });
        }

        // Verificar que todos los estudiantes seleccionados tienen BELBIN
        if (studentsWithBelbin.length !== selectedStudentIds.length) {
            const missingCount = selectedStudentIds.length - studentsWithBelbin.length;
            logger.error(`❌ [CELERY-ALGORITHM] ${missingCount} estudiantes sin BELBIN`);
            
            return res.status(400).json({
                success: false,
                error: 'INCOMPLETE_BELBIN_DATA',
                message: `${missingCount} students are missing BELBIN results`,
                totalSelected: selectedStudentIds.length,
                withBelbin: studentsWithBelbin.length,
                missingBelbin: missingCount,
                requestId
            });
        }

        // === FASE 5: CONSTRUCCIÓN DE DATOS DEL ALGORITMO ===
        logger.info(`🔍 [CELERY-ALGORITHM] Fase 5: Construyendo datos del algoritmo...`);
        
        // Crear mapeo de índices para constraints
        const studentIdToIndex = new Map();
        const membersWithTraits = studentsWithBelbin.map((student, index) => {
            studentIdToIndex.set(student._id.toString(), index);
            
            const belbinResult = student.askedQuestionnaires?.find(
                aq => ["TW", "CW", "CH", "ME", "CF", "SH", "PL", "RI"].includes(aq.result)
            );
            
            // Mapear códigos BELBIN si es necesario
            let mappedResult = belbinResult?.result || "SH";
            if (mappedResult === "IM") mappedResult = "CW";
            if (mappedResult === "CO") mappedResult = "CH";
            
            return { traits: [mappedResult] };
        });

        // Construir datos completos del algoritmo
        const processedAlgorithmData = {
            ...algorithmData,
            members: membersWithTraits,
            number_members: membersWithTraits.length
        };

        // === FASE 6: PROCESAMIENTO DE RESTRICCIONES ===
        logger.info(`🔍 [CELERY-ALGORITHM] Fase 6: Procesando restricciones del frontend...`);
        
        // Procesar restricciones "Must NOT be together"
        if (restrictions?.mustNotBeTogether?.length > 0) {
            logger.info(`🚫 [CELERY-ALGORITHM] Procesando ${restrictions.mustNotBeTogether.length} restricciones DifferentTeam`);
            
            restrictions.mustNotBeTogether.forEach((restriction: any[], restrictionIndex: number) => {
                const memberIndices = restriction
                    .map(user => studentIdToIndex.get(user._id))
                    .filter(index => index !== undefined);

                if (memberIndices.length >= 2) {
                    // Crear restricciones par a par
                    for (let i = 0; i < memberIndices.length; i++) {
                        for (let j = i + 1; j < memberIndices.length; j++) {
                            processedAlgorithmData.constraints.push({
                                type: "DifferentTeam",
                                name: `celery_must_not_${restrictionIndex}_${i}_${j}`,
                                members: [memberIndices[i], memberIndices[j]]
                            });
                        }
                    }
                    logger.info(`✅ [CELERY-ALGORITHM] Añadidas restricciones DifferentTeam para ${memberIndices.length} estudiantes`);
                }
            });
        }

        // Procesar restricciones "Must be together"
        if (restrictions?.mustBeTogether?.length > 0) {
            logger.info(`✅ [CELERY-ALGORITHM] Procesando ${restrictions.mustBeTogether.length} restricciones SameTeam`);
            
            restrictions.mustBeTogether.forEach((restriction: any[], restrictionIndex: number) => {
                const memberIndices = restriction
                    .map(user => studentIdToIndex.get(user._id))
                    .filter(index => index !== undefined);

                if (memberIndices.length >= 2) {
                    processedAlgorithmData.constraints.push({
                        type: "SameTeam",
                        name: `celery_must_be_${restrictionIndex}`,
                        members: memberIndices
                    });
                    logger.info(`✅ [CELERY-ALGORITHM] Añadida restricción SameTeam para ${memberIndices.length} estudiantes`);
                }
            });
        }

        // === FASE 7: PREPARACIÓN DE METADATOS ===
        const orderedStudentIds = studentsWithBelbin.map(student => student._id.toString());
        
        const taskMetadata = {
            requestId,
            activityTitle: activity.title,
            teacherId: req.session?.authuser,
            totalStudents: selectedStudentIds.length,
            constraintsCount: processedAlgorithmData.constraints.length,
            timestamp: new Date().toISOString(),
            environment: process.env.NODE_ENV || 'development'
        };

        logger.info(`📋 [CELERY-ALGORITHM] Metadatos preparados:`, {
            students: taskMetadata.totalStudents,
            constraints: taskMetadata.constraintsCount,
            environment: taskMetadata.environment
        });

        // === FASE 8: ENVÍO DE TAREA A CELERY ===
        logger.info(`🚀 [CELERY-ALGORITHM] Fase 8: Enviando tarea al sistema de colas...`);
        
        // Inicializar conexión con Celery si no está conectado
        await celeryService.connect();
        
        // Enviar tarea de workflow completo
        const celeryTaskId = await celeryService.executeCompleteAlgorithmWorkflow(
            activityId,
            processedAlgorithmData,
            orderedStudentIds,
            {
                requestId,
                frontend_restrictions: restrictions,
                group_configurations: groupConfigurations
            }
        );

        logger.info(`✅ [CELERY-ALGORITHM] Tarea enviada a Celery: ${celeryTaskId}`);

        // === FASE 9: ACTUALIZACIÓN DE ESTADO EN BASE DE DATOS ===
        logger.info(`🔍 [CELERY-ALGORITHM] Fase 9: Actualizando estado en base de datos...`);
        
        await collections.activities?.updateOne(
            { _id: new ObjectId(activityId) },
            {
                $set: {
                    algorithmStatus: 'running',
                    algorithmTaskId: celeryTaskId,
                    algorithmStartedAt: new Date(),
                    algorithmRequestId: requestId,
                    updatedAt: new Date()
                }
            }
        );

        // === FASE 10: ENVÍO DE NOTIFICACIÓN ===
        logger.info(`🔍 [CELERY-ALGORITHM] Fase 10: Enviando notificación...`);
        
        try {
            await addUserNotification(new ObjectId(activity.teacher), {
                title: '🚀 Algoritmo iniciado (Sistema Distribuido)',
                description: `El algoritmo ha comenzado a procesar ${membersWithTraits.length} estudiantes para "${activity.title}" usando el sistema de colas distribuido. Tiempo estimado: ${estimateExecutionTime(membersWithTraits.length)} minutos.`,
                link: `/activities/${activityId}`,
                metadata: {
                    taskId: celeryTaskId,
                    requestId,
                    system: 'celery_distributed'
                }
            });
            logger.info(`✅ [CELERY-ALGORITHM] Notificación enviada exitosamente`);
        } catch (notifError: any) {
            logger.warn(`⚠️ [CELERY-ALGORITHM] Error enviando notificación:`, notifError);
        }

        // === RESPUESTA EXITOSA ===
        logger.info(`🎉 [CELERY-ALGORITHM] ==========================================`);
        logger.info(`🎉 [CELERY-ALGORITHM] TAREA ENVIADA EXITOSAMENTE`);
        logger.info(`🎉 [CELERY-ALGORITHM] Task ID: ${celeryTaskId}`);
        logger.info(`🎉 [CELERY-ALGORITHM] Request ID: ${requestId}`);
        logger.info(`🎉 [CELERY-ALGORITHM] Estudiantes: ${membersWithTraits.length}`);
        logger.info(`🎉 [CELERY-ALGORITHM] ==========================================`);

        return res.status(202).json({
            success: true,
            message: 'Algorithm execution started successfully using distributed queue system',
            data: {
                taskId: celeryTaskId,
                requestId,
                activityId,
                activityTitle: activity.title,
                studentsCount: membersWithTraits.length,
                constraintsCount: processedAlgorithmData.constraints.length,
                estimatedTimeMinutes: estimateExecutionTime(membersWithTraits.length),
                system: 'celery_distributed',
                timestamp: new Date().toISOString(),
                trackingUrl: `/api/activities/${activityId}/algorithm/status/${celeryTaskId}`,
                monitoringUrl: process.env.NODE_ENV === 'development' ? 'http://localhost:5555' : null
            }
        });

    } catch (error: any) {
        logger.error(`💥 [CELERY-ALGORITHM] ==========================================`);
        logger.error(`💥 [CELERY-ALGORITHM] ERROR CRÍTICO`);
        logger.error(`💥 [CELERY-ALGORITHM] Request ID: ${requestId}`);
        logger.error(`💥 [CELERY-ALGORITHM] Error: ${error.message}`);
        logger.error(`💥 [CELERY-ALGORITHM] Stack: ${error.stack}`);
        logger.error(`💥 [CELERY-ALGORITHM] ==========================================`);

        // Actualizar estado de error en base de datos
        try {
            await collections.activities?.updateOne(
                { _id: new ObjectId(activityId) },
                {
                    $set: {
                        algorithmStatus: 'error',
                        algorithmError: {
                            message: error.message,
                            requestId,
                            timestamp: new Date().toISOString(),
                            system: 'celery_distributed'
                        },
                        updatedAt: new Date()
                    }
                }
            );
        } catch (updateError: any) {
            logger.error(`💥 [CELERY-ALGORITHM] Error adicional actualizando estado:`, updateError);
        }

        return res.status(500).json({
            success: false,
            error: 'INTERNAL_SERVER_ERROR',
            message: "Failed to start algorithm execution",
            details: {
                requestId,
                error: error.message,
                system: 'celery_distributed'
            },
            timestamp: new Date().toISOString()
        });
    }
});

// ============================================================================
// ENDPOINT PARA TRACKING DE STATUS
// ============================================================================

/**
 * Endpoint para obtener el estado de una tarea del algoritmo
 * @route GET /activities/:id/algorithm/status/:taskId
 */
activitiesCeleryRouter.get("/:id/algorithm/status/:taskId", verifyTeacher, async (req: Request, res: Response) => {
    const { id: activityId, taskId } = req.params;
    
    try {
        logger.info(`🔍 [CELERY-STATUS] Consultando estado de tarea: ${taskId} para actividad: ${activityId}`);
        
        // Verificar permisos de actividad
        const activity = await collections.activities?.findOne({ 
            _id: new ObjectId(activityId),
            teacher: new ObjectId(req.session?.authuser as string)
        });
        
        if (!activity) {
            return res.status(404).json({
                success: false,
                error: 'ACTIVITY_NOT_FOUND',
                message: 'Activity not found or insufficient permissions'
            });
        }

        // Obtener estado de la tarea desde Celery
        await celeryService.connect();
        const taskStatus = await celeryService.getTaskStatus(taskId);
        
        if (!taskStatus) {
            return res.status(404).json({
                success: false,
                error: 'TASK_NOT_FOUND',
                message: 'Task not found in the queue system',
                taskId
            });
        }

        // Obtener estadísticas de colas
        const queueStats = await celeryService.getQueueStats();

        return res.status(200).json({
            success: true,
            data: {
                taskId,
                status: taskStatus.status,
                result: taskStatus.result,
                error: taskStatus.error,
                startedAt: taskStatus.started_at,
                completedAt: taskStatus.completed_at,
                executionTime: taskStatus.execution_time,
                retries: taskStatus.retries,
                queue: taskStatus.queue,
                queueStats,
                activityStatus: activity.algorithmStatus,
                timestamp: new Date().toISOString()
            }
        });

    } catch (error: any) {
        logger.error(`💥 [CELERY-STATUS] Error obteniendo estado:`, error);
        return res.status(500).json({
            success: false,
            error: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to get task status',
            details: error.message
        });
    }
});

// ============================================================================
// ENDPOINT PARA CANCELAR TAREAS
// ============================================================================

/**
 * Endpoint para cancelar una tarea del algoritmo
 * @route POST /activities/:id/algorithm/cancel/:taskId
 */
activitiesCeleryRouter.post("/:id/algorithm/cancel/:taskId", verifyTeacher, async (req: Request, res: Response) => {
    const { id: activityId, taskId } = req.params;
    const { terminate = false } = req.body;
    
    try {
        logger.info(`🛑 [CELERY-CANCEL] Cancelando tarea: ${taskId} para actividad: ${activityId}`);
        
        // Verificar permisos
        const activity = await collections.activities?.findOne({ 
            _id: new ObjectId(activityId),
            teacher: new ObjectId(req.session?.authuser as string)
        });
        
        if (!activity) {
            return res.status(404).json({
                success: false,
                error: 'ACTIVITY_NOT_FOUND',
                message: 'Activity not found or insufficient permissions'
            });
        }

        // Cancelar tarea en Celery
        await celeryService.connect();
        await celeryService.revokeTask(taskId, terminate);

        // Actualizar estado en base de datos
        await collections.activities?.updateOne(
            { _id: new ObjectId(activityId) },
            {
                $set: {
                    algorithmStatus: 'cancelled',
                    algorithmCancelledAt: new Date(),
                    updatedAt: new Date()
                },
                $unset: {
                    algorithmTaskId: ''
                }
            }
        );

        logger.info(`✅ [CELERY-CANCEL] Tarea cancelada exitosamente: ${taskId}`);

        return res.status(200).json({
            success: true,
            message: 'Task cancelled successfully',
            data: {
                taskId,
                activityId,
                cancelled: true,
                terminate,
                timestamp: new Date().toISOString()
            }
        });

    } catch (error: any) {
        logger.error(`💥 [CELERY-CANCEL] Error cancelando tarea:`, error);
        return res.status(500).json({
            success: false,
            error: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to cancel task',
            details: error.message
        });
    }
});

// ============================================================================
// ENDPOINT PARA MONITOREO DE COLAS
// ============================================================================

/**
 * Endpoint para obtener estadísticas del sistema de colas
 * @route GET /activities/algorithm/queue-stats
 */
activitiesCeleryRouter.get("/algorithm/queue-stats", verifyTeacher, async (req: Request, res: Response) => {
    try {
        await celeryService.connect();
        
        const queueStats = await celeryService.getQueueStats();
        const healthStatus = await celeryService.healthCheck();
        
        return res.status(200).json({
            success: true,
            data: {
                healthy: healthStatus,
                queues: queueStats,
                system: 'celery_distributed',
                timestamp: new Date().toISOString(),
                monitoringUrl: process.env.NODE_ENV === 'development' ? 'http://localhost:5555' : null
            }
        });

    } catch (error: any) {
        logger.error(`💥 [CELERY-STATS] Error obteniendo estadísticas:`, error);
        return res.status(500).json({
            success: false,
            error: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to get queue statistics',
            details: error.message
        });
    }
});

// ============================================================================
// FUNCIONES AUXILIARES
// ============================================================================

/**
 * Estima el tiempo de ejecución basado en el número de estudiantes
 * @param studentCount Número de estudiantes
 * @returns Tiempo estimado en minutos
 */
const estimateExecutionTime = (studentCount: number): number => {
    if (studentCount <= 10) return 1;
    if (studentCount <= 20) return 2;
    if (studentCount <= 30) return 3;
    if (studentCount <= 50) return 5;
    return Math.ceil(studentCount / 10);
}; 