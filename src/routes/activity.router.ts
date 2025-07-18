import express, { Request, Response } from "express";

import { ObjectId } from "mongodb";
import { collections } from "../services/database.service";
import { webSocketService } from "../services/websocket.service";
import Activity, { AlgorithmConfig } from "../models/activity";

import { groupsRouter } from "./groups.router";
import { handleActivityStudentsRouter } from "./handle-activity-students.router";
import { createGroup, deleteGroup, confirmGroupsAndNotify } from "../functions/group-functions";
import { verifyTeacher } from "../middlewares";

import { Worker } from 'worker_threads';
import path from 'path';
import Group from "../models/group";
import { addUserNotification } from "../functions/user-functions";
import emailService from "../services/email.service";

// Importar funciones del algoritmo dinámico
import { 
    createAlgorithmFileForActivity,
    validateAllStudentsCompletedBelbin,
    algorithmFileExists,
    deleteAlgorithmFile,
    generateAlgorithmFileName,
    handleActivityChange,
    performCompleteValidation,
    ValidationResult
} from "../functions/algorithm-functions";

export const activitiesRouter = express.Router();

// Logging middleware para todas las rutas de activities
activitiesRouter.use((req, res, next) => {
    console.log(`🎯 [Activities] ${req.method} ${req.path} - IP: ${req.ip}`);
    next();
});

activitiesRouter.get("/", async (_req: Request, res: Response) => {
    try {
        console.log(`📋 [Activities] Obteniendo lista de actividades`);
        const activities = await collections.activities?.find<Activity[]>({}).toArray();
        console.log(`✅ [Activities] Encontradas ${activities?.length || 0} actividades`);
        res.status(200).send(activities);
    } catch (error: any) {
        console.error(`❌ [Activities] Error obteniendo actividades:`, error);
        res.status(500).send({
            message: error.message
        });
    }
});

activitiesRouter.get("/:id", async (req: Request, res: Response) => {

    const id = req?.params?.id;
    console.log(`🔍 [Activities] Obteniendo actividad con ID: ${id}`);

    try {
        const query = { _id: new ObjectId(id) };
        console.log(`🔍 [Activities] Query MongoDB: ${JSON.stringify(query)}`);
        const activity = await collections.activities?.findOne<Activity>(query);

        if (!activity) {
            console.log(`❌ [Activities] Actividad no encontrada con ID: ${id}`);
            res.status(404).send({
                message: `Unable to find matching document with id: ${id}`
            });
        } else {
            console.log(`✅ [Activities] Actividad encontrada: ${activity.title}`);
            res.status(200).send(activity);
        }

    } catch (error) {
        console.error(`❌ [Activities] Error obteniendo actividad ${id}:`, error);
        res.status(404).send({
            message: `Unable to find matching document with id: ${id}`
        });
    }
});

activitiesRouter.post("/", async (req: Request, res: Response) => {

    const authUserId = req.session?.authuser as string;

    try {

        const authUserObjectId = new ObjectId(authUserId);

        const { students, groups, ...filteredActivity } = req.body as Activity;

        filteredActivity.teacher = authUserObjectId;

        const createdActivity = await collections.activities?.insertOne(filteredActivity);

        await collections.users?.updateMany({ _id: authUserObjectId }, {
            $addToSet: { activities: createdActivity?.insertedId }
        });

        createdActivity
            ? res.status(200).send({
                message: `Successfully created a new activity with id ${createdActivity.insertedId}`,
                activity: {
                    ...filteredActivity,
                    _id: createdActivity.insertedId
                }
            })
            : res.status(500).send("Failed to create a new activity.");

    } catch (error: any) {
        console.error(error);
        res.status(400).send({
            message: error.message
        });
    }
});

activitiesRouter.put("/:id", verifyTeacher, async (req: Request, res: Response) => {

    const id = req?.params?.id;

    try {

        const { students, groups, ...filteredActivity } = req.body as Activity;

        const query = { _id: new ObjectId(id) };
        const result = await collections.activities?.updateOne(query, { $set: filteredActivity });

        if (result && result.modifiedCount) {
            res.status(202).send({
                message: `Successfully updated activity with id ${id}`
            });
        } else if (!result) {
            res.status(400).send({
                message: `Failed to update activity with id ${id}`
            });
        } else if (result.matchedCount) {
            res.status(304).send({
                message: `Activity with id ${id} is already up to date`
            });
        } else {
            res.status(404).send({
                message: `Activity with id ${id} does not exist`
            });
        }

    } catch (error: any) {
        console.error(error.message);
        res.status(400).send({
            message: error.message
        });
    }
});

activitiesRouter.delete("/:id", verifyTeacher, async (req: Request, res: Response) => {

    const id = req?.params?.id;

    try {
        const query = { _id: new ObjectId(id) };

        const activity = await collections.activities?.findOne<Activity>(query);
        const result = await collections.activities?.deleteOne(query);

        if (activity?.students?.length) {
            await collections.users?.updateMany({ _id: { $in: activity?.students } }, {
                $pull: { activities: activity?._id }
            });
        }

        await collections.users?.updateOne({ _id: activity?.teacher }, {
            $pull: { activities: activity?._id }
        });

        for (const group of activity?.groups || []) {
            await deleteGroup(group.toString());
        }

        if (result && result.deletedCount) {
            res.status(200).send({
                message: `Successfully removed activity with id ${id}`
            });
        } else if (!result) {
            res.status(400).send({
                message: `Failed to remove activity with id ${id}`
            });
        } else if (!result.deletedCount) {
            res.status(404).send({
                message: `Activity with id ${id} does not exist`
            });
        }
    } catch (error: any) {
        console.error(error.message);
        res.status(400).send({
            message: error.message
        });
    }
});

/**
 * Endpoint para configurar los parámetros del algoritmo de formación de equipos
 * @route PUT /activities/:id/algorithm/config
 * @param {string} id - ID de la actividad
 * @body {AlgorithmConfig} Configuración del algoritmo
 * @returns {Object} Resultado de la configuración
 */
activitiesRouter.put("/:id/algorithm/config", verifyTeacher, async (req: Request, res: Response) => {
    const activityId = req?.params?.id;
    const algorithmConfig: AlgorithmConfig = req.body;

    console.log(`🔧 [AlgorithmConfig] Configurando algoritmo para actividad: ${activityId}`);
    console.log(`📋 [AlgorithmConfig] Configuración recibida:`, algorithmConfig);

    try {
        // Validar que la actividad existe y pertenece al profesor
        const activity = await collections.activities?.findOne({ 
            _id: new ObjectId(activityId),
            teacher: new ObjectId(req.session?.authuser as string)
        });

        if (!activity) {
            return res.status(404).send({
                message: `Activity ${activityId} not found or you don't have permission`
            });
        }

        // Validaciones obligatorias de configuración del profesor
        if (!algorithmConfig.teamSize || algorithmConfig.teamSize < 2) {
            return res.status(400).send({
                message: "Team size must be at least 2 students and is required"
            });
        }

        if (!algorithmConfig.minTeams || algorithmConfig.minTeams < 1) {
            return res.status(400).send({
                message: "Minimum number of teams must be at least 1 and is required"
            });
        }

        if (!algorithmConfig.maxTeams || algorithmConfig.maxTeams < algorithmConfig.minTeams) {
            return res.status(400).send({
                message: "Maximum number of teams must be at least equal to minimum teams and is required"
            });
        }

        const totalStudents = activity.students?.length || 0;
        if (totalStudents === 0) {
            return res.status(400).send({
                message: "Cannot configure algorithm: no students assigned to this activity"
            });
        }

        if (algorithmConfig.teamSize > totalStudents) {
            return res.status(400).send({
                message: `Team size (${algorithmConfig.teamSize}) cannot be larger than total students (${totalStudents})`
            });
        }

        // Validar coherencia entre parámetros del profesor
        const minStudentsNeeded = algorithmConfig.minTeams * algorithmConfig.teamSize;
        const maxStudentsNeeded = algorithmConfig.maxTeams * algorithmConfig.teamSize;

        if (minStudentsNeeded > totalStudents) {
            return res.status(400).send({
                message: `Configuration requires at least ${minStudentsNeeded} students (${algorithmConfig.minTeams} teams × ${algorithmConfig.teamSize} students), but only ${totalStudents} students are assigned`
            });
        }

        // Usar EXACTAMENTE los parámetros del profesor, sin cálculos automáticos
        const config: AlgorithmConfig = {
            teamSize: algorithmConfig.teamSize,
            minTeams: algorithmConfig.minTeams,     // OBLIGATORIO del profesor
            maxTeams: algorithmConfig.maxTeams,     // OBLIGATORIO del profesor
            exclusions: algorithmConfig.exclusions || [],
            inclusions: algorithmConfig.inclusions || [],
            additionalConstraints: algorithmConfig.additionalConstraints || [],
            aggFunc: algorithmConfig.aggFunc || "sum",
            problemType: algorithmConfig.problemType || "TraitTeamFormation",
            isConfigured: true,
            lastConfiguredAt: new Date()
        };

        console.log(`📊 [AlgorithmConfig] Configuración del profesor aplicada exactamente:`, config);

        // Verificar si todos los estudiantes han completado BELBIN
        const allCompleted = await validateAllStudentsCompletedBelbin(activityId);
        
        let algorithmStatus = 'configured';
        let canGenerateFile = false;

        if (allCompleted) {
            algorithmStatus = 'ready';
            canGenerateFile = true;
            console.log(`✅ [AlgorithmConfig] Todos los estudiantes han completado BELBIN - Estado: ready`);
        } else {
            console.log(`⏳ [AlgorithmConfig] Algunos estudiantes aún no han completado BELBIN - Estado: configured`);
        }

        // Actualizar la actividad con la nueva configuración
        const updateResult = await collections.activities?.updateOne(
            { _id: new ObjectId(activityId) },
            {
                $set: {
                    algorithmConfig: config,
                    algorithmStatus: algorithmStatus,
                    updatedAt: new Date()
                }
            }
        );

        if (!updateResult?.matchedCount) {
            return res.status(500).send({
                message: "Failed to update activity configuration"
            });
        }

        console.log(`💾 [AlgorithmConfig] Configuración guardada exitosamente`);

        // 🔥 SISTEMA DE ESCUCHA DE CAMBIOS: Notificar cambio de configuración
        console.log(`🔔 [AlgorithmConfig] Activando sistema de escucha de cambios...`);
        await handleActivityChange(activityId, 'config-update', {
            newConfig: config,
            previousConfig: activity.algorithmConfig,
            configuredBy: req.session?.authuser,
            configuredAt: new Date().toISOString()
        });

        // Verificar si se generó archivo después del cambio
        const fileGeneratedAfterChange = algorithmFileExists(activityId);
        let filePath = null;

        if (fileGeneratedAfterChange) {
            filePath = generateAlgorithmFileName(activityId);
            console.log(`✅ [AlgorithmConfig] Archivo JSON generado por sistema de escucha: ${filePath}`);
        } else {
            console.log(`⏳ [AlgorithmConfig] Archivo JSON no generado - Esperando completitud BELBIN`);
        }

        // 🌐 WebSocket: Notificar configuración actualizada en tiempo real
        webSocketService.emitToUser(req.session?.authuser as string, 'activity-config-updated', {
            activityId: activityId,
            algorithmStatus: algorithmStatus,
            allStudentsCompletedBelbin: allCompleted,
            fileGenerated: fileGeneratedAfterChange,
            canRunAlgorithm: algorithmStatus === 'ready' && fileGeneratedAfterChange,
            timestamp: new Date().toISOString()
        });

        // 🌐 WebSocket: Notificar a estudiantes si el algoritmo está listo
        if (algorithmStatus === 'ready' && activity.students?.length) {
            const studentIds = activity.students.map(id => id.toString());
            webSocketService.emitToUsers(studentIds, 'activity-algorithm-ready', {
                activityId: activityId,
                title: activity.title,
                message: 'El algoritmo de formación de equipos está listo para ejecutarse',
                timestamp: new Date().toISOString()
            });
        }

        // Respuesta exitosa con información del nuevo sistema
        return res.status(200).send({
            message: "Algorithm configuration updated successfully",
            data: {
                activityId: activityId,
                algorithmConfig: config,
                algorithmStatus: algorithmStatus,
                allStudentsCompletedBelbin: allCompleted,
                totalStudents: totalStudents,
                // NO calculamos estimatedTeams - usamos solo parámetros del profesor
                professorParams: {
                    teamSize: config.teamSize,
                    minTeams: config.minTeams,
                    maxTeams: config.maxTeams
                },
                fileGenerated: fileGeneratedAfterChange,
                filePath,
                canRunAlgorithm: algorithmStatus === 'ready' && fileGeneratedAfterChange,
                configuredAt: config.lastConfiguredAt?.toISOString(),
                systemInfo: {
                    changeListenerActivated: true,
                    autoFileGeneration: fileGeneratedAfterChange,
                    nextSteps: allCompleted ? 
                        ["Algorithm ready to execute"] : 
                        [`${totalStudents - (allCompleted ? totalStudents : 0)} students need to complete BELBIN test`]
                }
            }
        });

    } catch (error: any) {
        console.error(`💥 [AlgorithmConfig] Error configurando algoritmo:`, error);
        return res.status(500).send({
            message: "Internal server error configuring algorithm",
            error: error.message
        });
    }
});

/**
 * Endpoint para obtener la configuración actual del algoritmo
 * @route GET /activities/:id/algorithm/config
 * @param {string} id - ID de la actividad
 * @returns {Object} Configuración actual del algoritmo
 */
activitiesRouter.get("/:id/algorithm/config", verifyTeacher, async (req: Request, res: Response) => {
    const activityId = req?.params?.id;

    try {
        const activity = await collections.activities?.findOne({ 
            _id: new ObjectId(activityId),
            teacher: new ObjectId(req.session?.authuser as string)
        });

        if (!activity) {
            return res.status(404).send({
                message: `Activity ${activityId} not found or you don't have permission`
            });
        }

        const allCompleted = await validateAllStudentsCompletedBelbin(activityId);
        const fileExists = algorithmFileExists(activityId);
        const totalStudents = activity.students?.length || 0;

        return res.status(200).send({
            data: {
                activityId: activityId,
                activityTitle: activity.title,
                algorithmConfig: activity.algorithmConfig || null,
                algorithmStatus: activity.algorithmStatus || 'not-configured',
                allStudentsCompletedBelbin: allCompleted,
                totalStudents: totalStudents,
                fileExists: fileExists,
                fileName: fileExists ? generateAlgorithmFileName(activityId) : null,
                canRunAlgorithm: activity.algorithmStatus === 'ready' && fileExists,
                // NO calculamos estimatedTeams - mostramos solo parámetros del profesor
                professorParams: activity.algorithmConfig ? {
                    teamSize: activity.algorithmConfig.teamSize,
                    minTeams: activity.algorithmConfig.minTeams,
                    maxTeams: activity.algorithmConfig.maxTeams
                } : null
            }
        });

    } catch (error: any) {
        console.error(`💥 [AlgorithmConfig] Error obteniendo configuración:`, error);
        return res.status(500).send({
            message: "Internal server error getting algorithm configuration",
            error: error.message
        });
    }
});

/**
 * Endpoint mejorado para validación completa del algoritmo usando el nuevo sistema
 * @route GET /activities/:id/algorithm/validation
 * @param {string} id - ID de la actividad
 * @returns {ValidationResult} Estado de validación detallado con recomendaciones
 */
activitiesRouter.get("/:id/algorithm/validation", verifyTeacher, async (req: Request, res: Response) => {
    const activityId = req?.params?.id;

    console.log(`🔍 [AlgorithmValidation] Iniciando validación completa para actividad: ${activityId}`);

    try {
        // Validar que la actividad existe y pertenece al profesor
        const activity = await collections.activities?.findOne({ 
            _id: new ObjectId(activityId),
            teacher: new ObjectId(req.session?.authuser as string)
        });

        if (!activity) {
            return res.status(404).send({
                message: `Activity ${activityId} not found or you don't have permission`
            });
        }

        // Usar el nuevo sistema de validación completa
        const validationResult: ValidationResult = await performCompleteValidation(activityId);

        console.log(`✅ [AlgorithmValidation] Validación completada para actividad: ${activityId}`);
        console.log(`📊 [AlgorithmValidation] Estado: ${validationResult.isValid ? 'VÁLIDO' : 'REQUIERE ATENCIÓN'}`);

        return res.status(200).send({
            data: {
                activityId: activityId,
                activityTitle: activity.title,
                ...validationResult,
                systemInfo: {
                    validationVersion: "2.0",
                    completedAt: new Date().toISOString(),
                    changeListenerActive: true,
                    autoRegenerationEnabled: activity.algorithmConfig?.isConfigured || false
                }
            }
        });

    } catch (error: any) {
        console.error(`💥 [AlgorithmValidation] Error en validación completa:`, error);
        return res.status(500).send({
            message: "Internal server error performing complete validation",
            error: error.message,
            activityId: activityId
        });
    }
});


// Tarea y cola para gestionar las peticiones al algoritmo

const MAX_WORKERS = 2;
let activeWorkers = 0;
const taskQueue: any[] = [];

/**
 * Endpoint para ejecutar el algoritmo de formación de equipos con datos del frontend
 * CORREGIDO: Ahora espera el resultado real del algoritmo antes de responder
 * @route POST /activities/:id/algorithm/execute
 * @param {string} id - ID de la actividad
 * @param {Object} req.body - Datos del algoritmo desde el frontend
 * @returns {Object} Resultado completo del algoritmo una vez terminado
 */
activitiesRouter.post("/:id/algorithm/execute", verifyTeacher, async (req: Request, res: Response) => {
    const activityId = req?.params?.id;
    const frontendData = req?.body;

    console.log(`🚀 [AlgorithmExecute] ==========================================`);
    console.log(`🚀 [AlgorithmExecute] INICIANDO EJECUCIÓN DE ALGORITMO`);
    console.log(`🚀 [AlgorithmExecute] Actividad: ${activityId}`);
    console.log(`🚀 [AlgorithmExecute] Profesor: ${(req.session as any)?.authuser}`);
    console.log(`🚀 [AlgorithmExecute] Datos del frontend:`, frontendData);
    console.log(`🚀 [AlgorithmExecute] Timestamp: ${new Date().toISOString()}`);
    console.log(`🚀 [AlgorithmExecute] ==========================================`);

    try {
        // Paso 1: Validar actividad
        console.log(`🔍 [AlgorithmExecute] Paso 1: Validando actividad...`);
        
        const activity = await collections.activities?.findOne({ 
            _id: new ObjectId(activityId),
            teacher: new ObjectId(req.session?.authuser as string)
        });
        
        if (!activity) {
            console.log(`❌ [AlgorithmExecute] Actividad no encontrada o acceso denegado`);
            return res.status(404).send({
                message: `Activity ${activityId} not found or you don't have permission`
            });
        }
        
        console.log(`✅ [AlgorithmExecute] Actividad validada: "${activity.title}"`);
        console.log(`📊 [AlgorithmExecute] Estudiantes en actividad: ${activity.students?.length || 0}`);

        // Paso 2: Procesar datos del frontend
        console.log(`🔍 [AlgorithmExecute] Paso 2: Procesando datos del frontend...`);
        
        const { algorithmData, selectedStudentIds, groupConfigurations, restrictions } = frontendData;
        
        if (!algorithmData || !selectedStudentIds) {
            console.log(`❌ [AlgorithmExecute] No se recibieron datos del algoritmo del frontend`);
            return res.status(400).send({
                message: "Missing algorithm data or selected student IDs from frontend"
            });
        }
        
        console.log(`✅ [AlgorithmExecute] Datos del frontend recibidos:`);
        console.log(`📊 [AlgorithmExecute] - Estudiantes seleccionados: ${selectedStudentIds.length}`);
        console.log(`📊 [AlgorithmExecute] - Constraints iniciales: ${algorithmData.constraints?.length || 0}`);
        console.log(`📊 [AlgorithmExecute] - Configuraciones: ${groupConfigurations?.length || 0}`);
        console.log(`📊 [AlgorithmExecute] - Restricciones: ${Object.keys(restrictions || {}).length}`);

        // Paso 3: Obtener traits BELBIN de estudiantes seleccionados
        console.log(`🔍 [AlgorithmExecute] Paso 3: Obteniendo traits BELBIN de estudiantes seleccionados...`);
        
        const selectedStudentObjectIds = selectedStudentIds.map((id: string) => new ObjectId(id));
        
        // DEBUG: Primero obtenemos TODOS los estudiantes seleccionados para ver su estructura
        console.log(`🔍 [AlgorithmExecute] DEBUG - Obteniendo todos los estudiantes seleccionados para análisis...`);
        const allSelectedStudents = await collections.users?.find({
            _id: { $in: selectedStudentObjectIds }
        }).toArray();
        
        console.log(`📊 [AlgorithmExecute] DEBUG - Estudiantes seleccionados encontrados: ${allSelectedStudents?.length || 0}`);
        
        // Analizar estructura de cada estudiante
        allSelectedStudents?.forEach((student, index) => {
            console.log(`👤 [AlgorithmExecute] DEBUG - Estudiante ${index + 1}: ${student.email}`);
            console.log(`   - ID: ${student._id}`);
            console.log(`   - askedQuestionnaires existe: ${!!student.askedQuestionnaires}`);
            console.log(`   - askedQuestionnaires length: ${student.askedQuestionnaires?.length || 0}`);
            
            if (student.askedQuestionnaires && student.askedQuestionnaires.length > 0) {
                student.askedQuestionnaires.forEach((aq: any, aqIndex: number) => {
                    console.log(`   - Questionnaire ${aqIndex}: result="${aq.result}", questionnaire="${aq.questionnaire}"`);
                });
            } else {
                console.log(`   - NO tiene askedQuestionnaires o está vacío`);
            }
        });
        
        // MODIFICADO: Obtener TODOS los estudiantes seleccionados, no solo los que tienen BELBIN
        console.log(`📊 [AlgorithmExecute] TODOS los estudiantes seleccionados: ${allSelectedStudents?.length || 0}`);
        
        // Verificar cuántos estudiantes tienen BELBIN (ya no es obligatorio)
        const studentsWithBelbin = allSelectedStudents?.filter(student => 
            student.askedQuestionnaires?.some(aq => 
                ["TW", "CW", "CH", "ME", "CF", "SH", "PL", "RI", "IM", "CO"].includes(aq.result)
            )
        ) || [];

        console.log(`📊 [AlgorithmExecute] Estudiantes con BELBIN: ${studentsWithBelbin.length}/${allSelectedStudents?.length || 0}`);
        
        if (studentsWithBelbin.length === 0) {
            console.log(`⚠️ [AlgorithmExecute] Ningún estudiante tiene BELBIN - usando algoritmo básico de distribución aleatoria`);
        } else {
            console.log(`✅ [AlgorithmExecute] ${studentsWithBelbin.length} estudiantes con BELBIN - usando algoritmo avanzado`);
        }

        // Crear mapeo de índices para constraints y procesar TODOS los estudiantes
        const studentIdToIndex = new Map();
        let studentsWithBelbinCount = 0;
        let studentsWithoutBelbinCount = 0;

        // NUEVO: Traits por defecto para estudiantes sin BELBIN (distribución balanceada)
        const DEFAULT_BELBIN_TRAITS = ["TW", "CW", "CH", "ME", "CF", "SH", "PL", "RI"];

        const membersWithTraits = allSelectedStudents?.map((student, index) => {
            studentIdToIndex.set(student._id.toString(), index);
            
            const belbinResult = student.askedQuestionnaires?.find(
                aq => ["TW", "CW", "CH", "ME", "CF", "SH", "PL", "RI", "IM", "CO"].includes(aq.result)
            );
            
            let traits: string[] = [];
            
            if (belbinResult) {
                // CORREGIDO: Mapear códigos BELBIN correctamente
                let mappedResult = belbinResult.result;
                if (mappedResult === "IM") mappedResult = "CW";  // Implementador → Coordinador de Trabajo
                if (mappedResult === "CO") mappedResult = "CH";  // Coordinator → Coordinador
                
                traits = [mappedResult];
                studentsWithBelbinCount++;
                console.log(`📝 [AlgorithmExecute] Estudiante ${student.email}: traits=${traits.join(', ')}`);
            } else {
                // NUEVO: Asignar trait por defecto basado en distribución cíclica para balance
                const defaultTrait = DEFAULT_BELBIN_TRAITS[index % DEFAULT_BELBIN_TRAITS.length];
                traits = [defaultTrait];
                studentsWithoutBelbinCount++;
                console.log(`📝 [AlgorithmExecute] Estudiante ${student.email}: sin BELBIN - asignado trait por defecto: ${defaultTrait}`);
            }
            
            return { traits };
        }) || [];

        console.log(`✅ [AlgorithmExecute] ${membersWithTraits.length} estudiantes procesados:`);
        console.log(`   📊 Con BELBIN real: ${studentsWithBelbinCount}`);
        console.log(`   📊 Con BELBIN asignado por defecto: ${studentsWithoutBelbinCount}`);
        console.log(`   📊 El algoritmo puede proceder con todos los estudiantes`);

        // Paso 4: Construir datos del algoritmo con traits reales
        console.log(`🔍 [AlgorithmExecute] Paso 4: Construyendo datos del algoritmo con traits reales...`);
        
        const processedAlgorithmData = {
            ...algorithmData,
            members: membersWithTraits,
            number_members: membersWithTraits.length
        };

        console.log(`✅ [AlgorithmExecute] Datos del algoritmo corregidos:`);
        console.log(`📊 [AlgorithmExecute] - Miembros: ${processedAlgorithmData.number_members}`);
        console.log(`📊 [AlgorithmExecute] - Members con traits: ${processedAlgorithmData.members.length}`);
        console.log(`📊 [AlgorithmExecute] - Traits sample: ${processedAlgorithmData.members.slice(0, 3).map((m: any) => m.traits.join(',')).join(' | ')}`);

        // CRÍTICO: Procesar groupConfigurations del frontend para crear constraints SizeCardinality correctas
        if (groupConfigurations && groupConfigurations.length > 0) {
            console.log(`🔧 [AlgorithmExecute] Procesando ${groupConfigurations.length} configuraciones de grupos del frontend...`);
            
            // Remover constraints SizeCardinality existentes que puedan estar mal configuradas
            processedAlgorithmData.constraints = processedAlgorithmData.constraints.filter(
                (constraint: any) => constraint.type !== 'SizeCardinality'
            );
            
            console.log(`🧹 [AlgorithmExecute] Constraints SizeCardinality previas removidas`);
            
            // Convertir cada groupConfiguration en constraint SizeCardinality
            groupConfigurations.forEach((config: any, index: number) => {
                const sizeConstraint = {
                    type: "SizeCardinality",
                    name: `frontend_config_${index}`,
                    team_size: config.size,
                    min: config.minQuantity,
                    max: config.maxQuantity
                };
                
                processedAlgorithmData.constraints.push(sizeConstraint);
                
                console.log(`✅ [AlgorithmExecute] Añadida constraint SizeCardinality ${index + 1}:`, {
                    team_size: config.size,
                    min: config.minQuantity,
                    max: config.maxQuantity,
                    descripcion: `${config.minQuantity}-${config.maxQuantity} grupos de ${config.size} estudiantes`
                });
            });
            
            // Calcular totales para validación
            const totalMinGroups = groupConfigurations.reduce((sum: number, config: any) => sum + config.minQuantity, 0);
            const totalMaxGroups = groupConfigurations.reduce((sum: number, config: any) => sum + config.maxQuantity, 0);
            const totalMinStudents = groupConfigurations.reduce((sum: number, config: any) => sum + (config.minQuantity * config.size), 0);
            const totalMaxStudents = groupConfigurations.reduce((sum: number, config: any) => sum + (config.maxQuantity * config.size), 0);
            
            console.log(`📊 [AlgorithmExecute] Resumen de configuración de grupos:`);
            console.log(`   📈 Grupos totales: ${totalMinGroups}-${totalMaxGroups}`);
            console.log(`   👥 Estudiantes necesarios: ${totalMinStudents}-${totalMaxStudents}`);
            console.log(`   🎯 Estudiantes disponibles: ${processedAlgorithmData.number_members}`);
            
            if (totalMinStudents > processedAlgorithmData.number_members) {
                console.log(`⚠️ [AlgorithmExecute] ADVERTENCIA: Configuración requiere mínimo ${totalMinStudents} estudiantes pero solo hay ${processedAlgorithmData.number_members}`);
            }
            
        } else {
            console.log(`📋 [AlgorithmExecute] No hay configuraciones específicas del frontend - usando constraints por defecto`);
        }

        // Paso 5: Procesar restricciones del frontend
        console.log(`🔍 [AlgorithmExecute] Paso 5: Procesando restricciones del frontend...`);
        
        console.log(`🔍 [AlgorithmExecute] DEBUG - Mapeo de estudiantes a índices:`);
        Array.from(studentIdToIndex.entries()).forEach(([id, index]) => {
            const student = allSelectedStudents?.find(s => s._id.toString() === id);
            console.log(`   Índice ${index}: ${student?.email} (ID: ${id})`);
        });
        
        // Procesar restricciones "Must NOT be together" (DifferentTeam)
        if (restrictions?.mustNotBeTogether?.length > 0) {
            console.log(`🚫 [AlgorithmExecute] Procesando ${restrictions.mustNotBeTogether.length} restricciones "Must NOT be together"`);
            
            restrictions.mustNotBeTogether.forEach((restriction: any[], restrictionIndex: number) => {
                console.log(`🔍 [AlgorithmExecute] Restricción mustNotBeTogether ${restrictionIndex}:`, restriction.map(u => u.email || u._id));
                
                const memberIndices = restriction
                    .map(user => {
                        const index = studentIdToIndex.get(user._id);
                        console.log(`   Usuario ${user.email || user._id} -> Índice ${index}`);
                        return index;
                    })
                    .filter(index => index !== undefined);

                console.log(`🔍 [AlgorithmExecute] Índices válidos para mustNotBeTogether: [${memberIndices.join(', ')}]`);

                if (memberIndices.length >= 2) {
                    // Para cada par de estudiantes en la restricción, crear una constraint DifferentTeam
                    for (let i = 0; i < memberIndices.length; i++) {
                        for (let j = i + 1; j < memberIndices.length; j++) {
                            const constraintToAdd = {
                                type: "DifferentTeam",
                                name: `frontend_must_not_${restrictionIndex}_${i}_${j}`,
                                members: [memberIndices[i], memberIndices[j]]
                            };
                            processedAlgorithmData.constraints.push(constraintToAdd);
                            console.log(`✅ [AlgorithmExecute] Añadida constraint DifferentTeam:`, constraintToAdd);
                        }
                    }
                    console.log(`✅ [AlgorithmExecute] Añadidas restricciones DifferentTeam para ${memberIndices.length} estudiantes`);
                } else {
                    console.log(`⚠️ [AlgorithmExecute] Restricción mustNotBeTogether ignorada - necesita al menos 2 miembros válidos (tiene ${memberIndices.length})`);
                }
            });
        }

        // Procesar restricciones "Must be together" (SameTeam)
        if (restrictions?.mustBeTogether?.length > 0) {
            console.log(`✅ [AlgorithmExecute] Procesando ${restrictions.mustBeTogether.length} restricciones "Must be together"`);
            
            restrictions.mustBeTogether.forEach((restriction: any[], restrictionIndex: number) => {
                console.log(`🔍 [AlgorithmExecute] Restricción mustBeTogether ${restrictionIndex}:`, restriction.map(u => u.email || u._id));
                
                const memberIndices = restriction
                    .map(user => {
                        const index = studentIdToIndex.get(user._id);
                        console.log(`   Usuario ${user.email || user._id} -> Índice ${index}`);
                        return index;
                    })
                    .filter(index => index !== undefined);

                console.log(`🔍 [AlgorithmExecute] Índices válidos para mustBeTogether: [${memberIndices.join(', ')}]`);

                if (memberIndices.length >= 2) {
                    const constraintToAdd = {
                        type: "SameTeam",
                        name: `frontend_must_be_${restrictionIndex}`,
                        members: memberIndices
                    };
                    processedAlgorithmData.constraints.push(constraintToAdd);
                    console.log(`✅ [AlgorithmExecute] Añadida constraint SameTeam:`, constraintToAdd);
                    console.log(`✅ [AlgorithmExecute] Añadida restricción SameTeam para ${memberIndices.length} estudiantes`);
                } else {
                    console.log(`⚠️ [AlgorithmExecute] Restricción mustBeTogether ignorada - necesita al menos 2 miembros válidos (tiene ${memberIndices.length})`);
                }
            });
        }

        // DEBUG: Mostrar todas las constraints finales
        console.log(`🔍 [AlgorithmExecute] DEBUG - Constraints finales del algoritmo:`);
        processedAlgorithmData.constraints.forEach((constraint: any, index: number) => {
            console.log(`   ${index}: ${constraint.type} - ${constraint.name} - members: [${constraint.members?.join(', ') || 'N/A'}]`);
        });

        // 7. Generar archivo JSON usando datos del frontend
        console.log(`🔍 [AlgorithmExecute] Paso 7: Generando archivo JSON con datos del frontend...`);
        const { saveAlgorithmJSON, getAlgorithmFilePath } = await import("../functions/algorithm-functions");
        
        try {
            const filePath = await saveAlgorithmJSON(activityId, processedAlgorithmData);
            if (!filePath) {
                throw new Error("No se pudo guardar el archivo JSON");
            }
            console.log(`✅ [AlgorithmExecute] Archivo JSON generado con datos del frontend: ${filePath}`);
        } catch (jsonError: any) {
            console.log(`❌ [AlgorithmExecute] Error generando archivo JSON:`, jsonError);
            return res.status(500).send({
                message: "Failed to generate algorithm JSON file with frontend data",
                error: jsonError.message
            });
        }

        // Paso 8: Verificar estado de ejecución
        console.log(`🔍 [AlgorithmExecute] Paso 8: Verificando estado de ejecución...`);
        if (activity.algorithmStatus === 'running') {
            console.log(`⚠️ [AlgorithmExecute] Algoritmo ya en ejecución`);
            return res.status(409).send({
                message: 'Algorithm is already running',
                status: activity.algorithmStatus,
                activityId: activityId
            });
        }

        console.log(`✅ [AlgorithmExecute] Todas las validaciones pasadas`);

        // Paso 9: Preparar datos del worker
        console.log(`🔍 [AlgorithmExecute] Paso 9: Preparando datos del worker...`);
        
        // CRÍTICO: Enviar los IDs de estudiantes en el orden exacto usado para el JSON
        const orderedStudentIds = studentsWithBelbin.map(student => student._id.toString());
        
        // CORREGIDO: Enviar todos los campos que el worker espera
        const customConstraints = processedAlgorithmData.constraints.filter((c: any) => 
            c.type === 'SameTeam' || c.type === 'DifferentTeam'
        );
        
        const workerData = {
            activityId: activityId,
            teamSize: processedAlgorithmData.constraints.find((c: any) => c.type === 'SizeCardinality')?.team_size || 4,
            constraintsCount: customConstraints.length,
            studentsCount: processedAlgorithmData.number_members,
            customConstraints: customConstraints,
            // NUEVO: Enviar los IDs en el orden correcto para que el worker use el mismo mapeo
            orderedStudentIds: orderedStudentIds
        };

        console.log(`📋 [AlgorithmExecute] Datos del worker (con datos del frontend):`, {
            activityId: workerData.activityId,
            teamSize: workerData.teamSize,
            constraintsCount: workerData.constraintsCount,
            studentsCount: workerData.studentsCount,
            orderedStudentIds: workerData.orderedStudentIds?.length || 0
        });

        // Paso 10: Enviar notificación de inicio
        console.log(`🔍 [AlgorithmExecute] Paso 10: Enviando notificación de inicio...`);
        try {
            await addUserNotification(new ObjectId(activity.teacher), {
                title: '🚀 Algoritmo de formación iniciado',
                description: `El algoritmo ha comenzado a procesar ${processedAlgorithmData.number_members} estudiantes para la actividad "${activity.title}". Tiempo estimado: ${estimateExecutionTime(activity.students?.length || 0)} minutos.`,
                link: `/activities/${activityId}`
            });
            console.log(`✅ [AlgorithmExecute] Notificación enviada`);
        } catch (notifError: any) {
            console.log(`⚠️ [AlgorithmExecute] Error enviando notificación:`, notifError);
        }

        // Paso 11: Actualizar estado a 'running'
        console.log(`🔍 [AlgorithmExecute] Paso 11: Actualizando estado a 'running'...`);
        
        await collections.activities?.updateOne({ _id: new ObjectId(activityId) }, {
            $set: { 
                algorithmStatus: 'running',
                algorithmStartedAt: new Date(),
                updatedAt: new Date()
            }
        });
        
        console.log(`✅ [AlgorithmExecute] Estado actualizado a 'running'`);

        // Paso 12: CORREGIDO - Esperar resultado del worker en lugar de responder inmediatamente
        console.log(`🔍 [AlgorithmExecute] Paso 12: Ejecutando worker y esperando resultado...`);
        console.log(`👷 [AlgorithmExecute] Workers activos: ${activeWorkers}/${MAX_WORKERS}`);

        // Crear una promesa que se resuelva cuando el worker termine
        const algorithmPromise = new Promise<any>((resolve, reject) => {
            if (activeWorkers < MAX_WORKERS) {
                console.log(`🚀 [AlgorithmExecute] Iniciando worker inmediatamente`);
                startAlgorithmWorkerWithCallback(workerData, resolve, reject);
            } else {
                console.log(`⏳ [AlgorithmExecute] Añadiendo a cola - Posición: ${taskQueue.length + 1}`);
                taskQueue.push({ workerData, resolve, reject });
            }
        });

        console.log(`🔄 [AlgorithmExecute] Esperando resultado del algoritmo...`);
        
        // Esperar a que el algoritmo termine (esto puede tardar 15-30 segundos)
        const algorithmResult = await algorithmPromise;

        console.log(`🚀 [AlgorithmExecute] ==========================================`);
        console.log(`🚀 [AlgorithmExecute] ALGORITMO COMPLETADO EXITOSAMENTE`);
        console.log(`🚀 [AlgorithmExecute] Actividad: "${activity.title}"`);
        console.log(`🚀 [AlgorithmExecute] Estudiantes procesados: ${processedAlgorithmData.number_members}`);
        console.log(`🚀 [AlgorithmExecute] Equipos creados: ${algorithmResult.teamsCount}`);
        console.log(`🚀 [AlgorithmExecute] Tiempo total: ${Date.now() - algorithmResult.executionTime}ms`);
        console.log(`🚀 [AlgorithmExecute] ==========================================`);

        // Responder con el resultado completo
        return res.status(200).send({
            message: 'Algorithm execution completed successfully',
            activityId: activityId,
            activityTitle: activity.title,
            result: algorithmResult,
            studentsProcessed: processedAlgorithmData.number_members,
            teamsCreated: algorithmResult.teamsCount,
            executionTime: Date.now() - algorithmResult.executionTime,
            timestamp: new Date().toISOString(),
            stage: "completed"
        });

    } catch (error: any) {
        console.log(`💥 [AlgorithmExecute] ==========================================`);
        console.log(`💥 [AlgorithmExecute] ERROR CRÍTICO EN EJECUCIÓN`);
        console.log(`💥 [AlgorithmExecute] Actividad: ${activityId}`);
        console.log(`💥 [AlgorithmExecute] Error: ${error.message}`);
        console.log(`💥 [AlgorithmExecute] Stack: ${error.stack}`);
        console.log(`💥 [AlgorithmExecute] ==========================================`);

        // Actualizar estado de error
        try {
            await collections.activities?.updateOne({ _id: new ObjectId(activityId) }, {
                $set: { 
                    algorithmStatus: 'error',
                    algorithmError: error.message,
                    updatedAt: new Date()
                }
            });
            console.log(`🔧 [AlgorithmExecute] Estado actualizado a 'error'`);
        } catch (updateError: any) {
            console.error(`💥 [AlgorithmExecute] Error adicional actualizando estado:`, updateError);
        }

        return res.status(500).send({
            message: "Internal server error executing algorithm",
            error: error.message,
            activityId: activityId,
            timestamp: new Date().toISOString(),
            stage: "execution"
        });
    }
});

/**
 * Endpoint legado para compatibilidad con el sistema anterior
 * @deprecated Usar /algorithm/execute en su lugar
 */
activitiesRouter.post("/:id/create-algorithm", verifyTeacher, async (req: Request, res: Response) => {
    console.log(`⚠️ [DeprecatedEndpoint] Uso de endpoint legado /create-algorithm para actividad: ${req.params.id}`);
    
    // Devolver mensaje de deprecación indicando el nuevo endpoint
    return res.status(410).send({
        message: "This endpoint is deprecated. Please use POST /activities/:id/algorithm/execute instead.",
        deprecatedEndpoint: "/create-algorithm",
        newEndpoint: "/algorithm/execute",
        migrationNote: "Update your client to use the new endpoint for algorithm execution."
    });
});

/**
 * Estima el tiempo de ejecución del algoritmo basado en el número de estudiantes
 * @param {number} studentCount - Número de estudiantes
 * @returns {number} Tiempo estimado en minutos
 */
const estimateExecutionTime = (studentCount: number): number => {
    if (studentCount <= 10) return 1;
    if (studentCount <= 20) return 2;
    if (studentCount <= 30) return 3;
    if (studentCount <= 50) return 5;
    return Math.ceil(studentCount / 10); // 1 minuto por cada 10 estudiantes aprox
};

/**
 * Versión original del worker para compatibilidad
 */
const startAlgorithmWorker = (workerData: any) => {
    activeWorkers++;

    const { activityId } = workerData;
    console.log(`👷 [AlgorithmWorker] Iniciando worker para actividad: ${activityId}`);

    const worker = new Worker(path.join(__dirname, '../scripts/algorithm-req-worker.js'), { workerData });

    worker.on('message', async (workerResult) => {
        console.log(`📨 [AlgorithmWorker] Mensaje recibido del worker para actividad: ${activityId}`);
        console.log(`📋 [AlgorithmWorker] Resultado:`, workerResult);

        try {
            if (workerResult.success) {
                // Algoritmo ejecutado exitosamente
                console.log(`✅ [AlgorithmWorker] Algoritmo exitoso para actividad: ${activityId}`);

                // Actualizar estado de la actividad
                await collections.activities?.updateOne({ _id: new ObjectId(activityId) }, {
                    $set: { 
                        algorithmStatus: 'done',
                        algorithmResult: workerResult,
                        updatedAt: new Date()
                    }
                });

                // Procesar los resultados y crear grupos
                const teams = workerResult.teams;
                console.log(`👥 [AlgorithmWorker] Creando ${teams.length} grupos para actividad: ${activityId}`);

                                // ✅ CORREGIDO: Crear grupos en estado 'draft' sin notificar automáticamente
                const groupCreationPromises = teams.map(async (team: any, index: number) => {
                    try {
                        const groupName = `Equipo ${index + 1}`;
                        console.log(`🏗️ [AlgorithmWorker] Creando grupo DRAFT: ${groupName} con ${team.length} estudiantes`);
                        
                        await createGroup(activityId, {
                            name: groupName,
                            students: team,
                            activity: new ObjectId(activityId),
                            status: 'draft', // ✅ Estado draft - pendiente de confirmación
                            creationMethod: 'algorithm', // ✅ Creado por algoritmo
                            createdAt: new Date(),
                            metadata: {
                                algorithmVersion: '2.0',
                                teamSize: team.length,
                                creation_method: 'algorithm_worker'
                            }
                        } as any, { 
                            sendNotifications: false // ✅ NO enviar notificaciones aún
                        });
                        
                        console.log(`✅ [AlgorithmWorker] Grupo DRAFT creado: ${groupName}`);
                    } catch (groupError: any) {
                        console.error(`💥 [AlgorithmWorker] Error creando grupo ${index + 1}:`, groupError);
                    }
                });

                // Esperar a que se creen todos los grupos
                await Promise.all(groupCreationPromises);

                // Obtener información de la actividad para notificación
                const activity = await collections.activities?.findOne({ _id: new ObjectId(activityId) });

                // Enviar notificación de finalización exitosa
            await addUserNotification(new ObjectId(activity?.teacher), {
                    title: '🎉 Algoritmo de formación completado',
                    description: `El algoritmo ha creado ${teams.length} equipos exitosamente para la actividad "${activity?.title}". ¡Revisa los resultados!`,
                link: `/activities/${activityId}`
            });

                console.log(`🎉 [AlgorithmWorker] Proceso completado exitosamente para actividad: ${activityId}`);

            } else {
                // Error en el algoritmo
                console.error(`❌ [AlgorithmWorker] Error en algoritmo para actividad: ${activityId}`);
                console.error(`💥 [AlgorithmWorker] Error details:`, workerResult.error);

                // Actualizar estado de error
                await collections.activities?.updateOne({ _id: new ObjectId(activityId) }, {
                    $set: { 
                        algorithmStatus: 'error',
                        algorithmResult: workerResult,
                        updatedAt: new Date()
                    }
                });

                // Obtener información de la actividad para notificación
                const activity = await collections.activities?.findOne({ _id: new ObjectId(activityId) });

                // Enviar notificación de error
                await addUserNotification(new ObjectId(activity?.teacher), {
                    title: '❌ Error en algoritmo de formación',
                    description: `Hubo un error ejecutando el algoritmo para la actividad "${activity?.title}". Error: ${workerResult.error}`,
                    link: `/activities/${activityId}`
                });
            }
            
        } catch (error: any) {
            console.error(`💥 [AlgorithmWorker] Error crítico procesando resultado:`, error);
            
            // Actualizar estado de error crítico
            await collections.activities?.updateOne({ _id: new ObjectId(activityId) }, {
                $set: { 
                    algorithmStatus: 'error',
                    updatedAt: new Date()
                }
            });

            // Obtener información de la actividad para notificación
            const activity = await collections.activities?.findOne({ _id: new ObjectId(activityId) });

            // Enviar notificación de error crítico
            await addUserNotification(new ObjectId(activity?.teacher), {
                title: '💥 Error crítico en algoritmo',
                description: `Error crítico procesando resultado del algoritmo para "${activity?.title}". Contacta al administrador.`,
                link: `/activities/${activityId}`
            });
        }
    });

    worker.on('error', async (workerError) => {
        console.error(`💥 [AlgorithmWorker] Error en worker para actividad: ${activityId}`, workerError);
        
        // Actualizar estado de error
        await collections.activities?.updateOne({ _id: new ObjectId(activityId) }, {
            $set: { 
                algorithmStatus: 'error',
                updatedAt: new Date()
            }
        });
    });

    worker.on('exit', (code) => {
        activeWorkers--;
        console.log(`🚪 [AlgorithmWorker] Worker terminado para actividad: ${activityId} con código: ${code}`);

        // Procesar siguiente tarea en cola
        if (taskQueue.length > 0) {
            const nextTask = taskQueue.shift();
            console.log(`⏭️ [AlgorithmWorker] Procesando siguiente tarea en cola: ${nextTask.activityId}`);
            startAlgorithmWorker(nextTask);
        }

        if (code !== 0) {
            console.error(`⚠️ [AlgorithmWorker] Worker terminó con código de error: ${code}`);
        }
    });
};

/**
 * Nueva versión del worker que permite esperar el resultado con callbacks/promesas
 * Esta función ejecuta el algoritmo y resuelve la promesa cuando termina
 */
const startAlgorithmWorkerWithCallback = (workerData: any, resolve: (value: any) => void, reject: (reason: any) => void) => {
    activeWorkers++;

    const { activityId } = workerData;
    console.log(`👷 [AlgorithmWorkerCallback] Iniciando worker con callback para actividad: ${activityId}`);

    const worker = new Worker(path.join(__dirname, '../scripts/algorithm-req-worker.js'), { workerData });

    worker.on('message', async (workerResult) => {
        console.log(`📨 [AlgorithmWorkerCallback] Mensaje recibido del worker para actividad: ${activityId}`);
        console.log(`📋 [AlgorithmWorkerCallback] Resultado:`, workerResult);

        try {
            if (workerResult.success) {
                // Algoritmo ejecutado exitosamente
                console.log(`✅ [AlgorithmWorkerCallback] Algoritmo exitoso para actividad: ${activityId}`);

                // Actualizar estado de la actividad
                await collections.activities?.updateOne({ _id: new ObjectId(activityId) }, {
                    $set: { 
                        algorithmStatus: 'done',
                        algorithmResult: workerResult,
                        algorithmCompletedAt: new Date(),
                        updatedAt: new Date()
                    }
                });

                // Procesar los resultados y crear grupos
                const teams = workerResult.teams;
                console.log(`👥 [AlgorithmWorkerCallback] Creando ${teams.length} grupos para actividad: ${activityId}`);

                // ✅ CORREGIDO: Crear grupos en estado 'draft' sin notificar automáticamente
                const groupCreationPromises = teams.map(async (team: any, index: number) => {
                    try {
                        const groupName = `Equipo ${index + 1}`;
                        console.log(`🏗️ [AlgorithmWorkerCallback] Creando grupo DRAFT: ${groupName} con ${team.length} estudiantes`);
                        
                        await createGroup(activityId, {
                            name: groupName,
                            students: team,
                            activity: new ObjectId(activityId),
                            status: 'draft', // ✅ Estado draft - pendiente de confirmación
                            creationMethod: 'algorithm', // ✅ Creado por algoritmo
                            createdAt: new Date(),
                            metadata: {
                                algorithmVersion: '2.0_callback',
                                teamSize: team.length,
                                creation_method: 'algorithm_worker_callback'
                            }
                        } as any, { 
                            sendNotifications: false // ✅ NO enviar notificaciones aún
                        });
                        
                        console.log(`✅ [AlgorithmWorkerCallback] Grupo DRAFT creado: ${groupName}`);
                    } catch (groupError: any) {
                        console.error(`💥 [AlgorithmWorkerCallback] Error creando grupo ${index + 1}:`, groupError);
                    }
                });

                // Esperar a que se creen todos los grupos
                await Promise.all(groupCreationPromises);

                // Obtener información de la actividad para notificación
                const activity = await collections.activities?.findOne({ _id: new ObjectId(activityId) });

                // ✅ CORREGIDO: Notificar al profesor que debe revisar y confirmar los grupos
                await addUserNotification(new ObjectId(activity?.teacher), {
                    title: '📋 Grupos Listos para Revisión',
                    description: `El algoritmo ha creado ${teams.length} grupos para "${activity?.title}". Revisa y confirma los grupos para notificar a los estudiantes.`,
                    link: `/activities/${activityId}`
                });

                console.log(`🎉 [AlgorithmWorkerCallback] Proceso completado exitosamente para actividad: ${activityId}`);

                // Resolver la promesa con el resultado exitoso
                resolve({
                    success: true,
                    teamsCount: teams.length,
                    executionTime: Date.now(),
                    result: workerResult.result,
                    activityId: activityId
                });

            } else {
                // Error en el algoritmo
                console.error(`❌ [AlgorithmWorkerCallback] Error en algoritmo para actividad: ${activityId}`);
                console.error(`💥 [AlgorithmWorkerCallback] Error details:`, workerResult.error);

                // Actualizar estado de error
                await collections.activities?.updateOne({ _id: new ObjectId(activityId) }, {
                    $set: { 
                        algorithmStatus: 'error',
                        algorithmResult: workerResult,
                        algorithmCompletedAt: new Date(),
                        updatedAt: new Date()
                    }
                });

                // Obtener información de la actividad para notificación
                const activity = await collections.activities?.findOne({ _id: new ObjectId(activityId) });

                // Enviar notificación de error
                await addUserNotification(new ObjectId(activity?.teacher), {
                    title: '❌ Error en algoritmo de formación',
                    description: `Hubo un error ejecutando el algoritmo para la actividad "${activity?.title}". Error: ${workerResult.error}`,
                    link: `/activities/${activityId}`
                });

                // Rechazar la promesa con el error
                reject(new Error(`Algorithm execution failed: ${workerResult.error}`));
            }
            
        } catch (error: any) {
            console.error(`💥 [AlgorithmWorkerCallback] Error crítico procesando resultado:`, error);
            
            // Actualizar estado de error crítico
            await collections.activities?.updateOne({ _id: new ObjectId(activityId) }, {
                $set: { 
                    algorithmStatus: 'error',
                    algorithmCompletedAt: new Date(),
                    updatedAt: new Date()
                }
            });

            // Obtener información de la actividad para notificación
            const activity = await collections.activities?.findOne({ _id: new ObjectId(activityId) });

            // Enviar notificación de error crítico
            await addUserNotification(new ObjectId(activity?.teacher), {
                title: '💥 Error crítico en algoritmo',
                description: `Error crítico procesando resultado del algoritmo para "${activity?.title}". Contacta al administrador.`,
                link: `/activities/${activityId}`
            });

            // Rechazar la promesa con el error crítico
            reject(error);
        }
    });

    worker.on('error', async (workerError) => {
        console.error(`💥 [AlgorithmWorkerCallback] Error en worker para actividad: ${activityId}`, workerError);
        
        // Actualizar estado de error
        await collections.activities?.updateOne({ _id: new ObjectId(activityId) }, {
            $set: { 
                algorithmStatus: 'error',
                algorithmCompletedAt: new Date(),
                updatedAt: new Date()
            }
        });

        // Rechazar la promesa con el error del worker
        reject(workerError);
    });

    worker.on('exit', (code) => {
        activeWorkers--;
        console.log(`🚪 [AlgorithmWorkerCallback] Worker terminado para actividad: ${activityId} con código: ${code}`);

        // Procesar siguiente tarea en cola
        if (taskQueue.length > 0) {
            const nextTask = taskQueue.shift();
            console.log(`⏭️ [AlgorithmWorkerCallback] Procesando siguiente tarea en cola`);
            
            // Verificar si la siguiente tarea tiene callbacks (nueva versión) o es la versión anterior
            if (nextTask.resolve && nextTask.reject) {
                startAlgorithmWorkerWithCallback(nextTask.workerData, nextTask.resolve, nextTask.reject);
            } else {
                // Versión anterior sin callbacks
                startAlgorithmWorker(nextTask);
            }
        }

        if (code !== 0) {
            console.error(`⚠️ [AlgorithmWorkerCallback] Worker terminó con código de error: ${code}`);
            reject(new Error(`Worker process exited with code ${code}`));
        }
    });
};

activitiesRouter.post("/:id/send-questionnaire-remaining/:questionnaireId", async (req: Request, res: Response) => {

    const { id, questionnaireId } = req?.params;

    try {
        // Obtener la actividad por ID
        const activity = await collections.activities?.findOne({ _id: new ObjectId(id) });
        if (!activity) {
          return res.status(400).send({ message: 'Actividad no encontrada' });
        }

        // Buscar estudiantes que no han respondido el cuestionario (verificación global por usuario)
        const studentsWhoDidNotAnswer = await collections.users?.find({
            _id: { $in: activity.students },  // Filtrar estudiantes asignados
            askedQuestionnaires: { 
              $not: {
                $elemMatch: {
                  questionnaire: new ObjectId(questionnaireId)  // Filtrar estudiantes que no han respondido el cuestionario globalmente
                }
              }
            }
          }).toArray();
        
        // console.log(studentsWhoDidNotAnswer);

        // Enviar recordatorios profesionales a cada estudiante
        for (const student of studentsWhoDidNotAnswer || []) {
            try {
                await emailService.sendQuestionnaireReminder(student.email, questionnaireId);
                console.log(`✅ [QuestionnaireReminder] Email enviado a: ${student.email}`);
            } catch (error) {
                console.error(`❌ [QuestionnaireReminder] Error enviando email a ${student.email}:`, error);
            }
        }

        return res.status(200).send({
            message: 'Mails sent successfully'
        });

      } catch (error:any) {
        console.error('Error al obtener los estudiantes:', error);
        return res.status(400).send({
            message: error.message
        });
      }   

});

/**
 * Endpoint para obtener el estado de completitud de cuestionarios de estudiantes en una actividad
 * Este endpoint es especialmente útil para mostrar al profesor qué estudiantes han completado
 * qué tests, independientemente de cuándo los completaron o en qué actividad estaban originalmente
 *
 * @route GET /activities/:id/students/questionnaires-status
 * @param {string} id - ID de la actividad
 * @returns {Object} Estado detallado de cuestionarios por estudiante
 */
activitiesRouter.get("/:id/students/questionnaires-status", async (req: Request, res: Response) => {
    const activityId = req?.params?.id;

    try {
        console.log(`📋 [Activity] Consultando estado de cuestionarios para actividad: ${activityId}`);
        
        // Verificar que la actividad existe
        const activity = await collections.activities?.findOne({ _id: new ObjectId(activityId) });
        if (!activity) {
            console.log(`❌ [Activity] Actividad ${activityId} no encontrada`);
            return res.status(404).send({
                message: `Activity with id ${activityId} does not exist`
            });
        }

        // Obtener todos los cuestionarios habilitados
        const questionnaires = await collections.questionnaires?.find({ enabled: true }).toArray();
        
        if (!questionnaires || questionnaires.length === 0) {
            console.log(`⚠️ [Activity] No hay cuestionarios habilitados en el sistema`);
            return res.status(200).send({
                activityId: activityId,
                activityTitle: activity.title,
                students: [],
                questionnaires: [],
                message: "No hay cuestionarios habilitados en el sistema"
            });
        }

        // Obtener información completa de todos los estudiantes de la actividad
        const students = await collections.users?.find({
            _id: { $in: activity.students || [] }
        }).toArray();

        if (!students || students.length === 0) {
            console.log(`⚠️ [Activity] No hay estudiantes en la actividad ${activityId}`);
            return res.status(200).send({
                activityId: activityId,
                activityTitle: activity.title,
                students: [],
                questionnaires: questionnaires.map(q => ({
                    questionnaireId: q._id,
                    questionnaireTitle: q.title,
                    questionnaireType: q.questionnaireType
                })),
                message: "No hay estudiantes asignados a esta actividad"
            });
        }

        console.log(`👥 [Activity] Procesando ${students.length} estudiantes y ${questionnaires.length} cuestionarios`);

        // Crear el estado detallado para cada estudiante
        const studentsStatus = students.map(student => {
            console.log(`🔍 [Activity] Procesando estudiante: ${student.email}`);

            // Para cada cuestionario, verificar si el estudiante lo ha completado (verificación global)
            const questionnairesStatus = questionnaires.map(questionnaire => {
                const hasCompleted = (student.askedQuestionnaires?.some(aq => aq.questionnaire.equals(questionnaire._id))) || false;
                
                let result = null;
                let completedAt = null;

                if (hasCompleted && student.askedQuestionnaires) {
                    const completedQuest = student.askedQuestionnaires.find(aq => aq.questionnaire.equals(questionnaire._id));
                    result = completedQuest?.result || null;
                    completedAt = completedQuest?.completedAt || null;
                }

                const status = hasCompleted ? '✅ COMPLETADO' : '❌ PENDIENTE';
                console.log(`  📝 ${questionnaire.title}: ${status} ${result ? `(${result})` : ''}`);

                return {
                    questionnaireId: questionnaire._id,
                    questionnaireTitle: questionnaire.title,
                    questionnaireType: questionnaire.questionnaireType,
                    hasCompleted: hasCompleted,
                    result: result,
                    completedAt: completedAt
                };
            });

            const totalCompleted = questionnairesStatus.filter(q => q.hasCompleted).length;
            const completionPercentage = questionnaires.length > 0 ? 
                Math.round((totalCompleted / questionnaires.length) * 100) : 0;

            console.log(`📊 [Activity] Estudiante ${student.email}: ${totalCompleted}/${questionnaires.length} completados (${completionPercentage}%)`);

            return {
                userId: student._id,
                userName: student.name,
                userEmail: student.email,
                totalQuestionnaires: questionnaires.length,
                completedQuestionnaires: totalCompleted,
                completionPercentage: completionPercentage,
                questionnairesStatus: questionnairesStatus
            };
        });

        // Calcular estadísticas generales de la actividad
        const totalStudents = students.length;
        const activityStats = questionnaires.map(questionnaire => {
            const completedCount = studentsStatus.filter(student => 
                student.questionnairesStatus.find(q => q.questionnaireId.equals(questionnaire._id) && q.hasCompleted)
            ).length;

            return {
                questionnaireId: questionnaire._id,
                questionnaireTitle: questionnaire.title,
                questionnaireType: questionnaire.questionnaireType,
                completedCount: completedCount,
                totalStudents: totalStudents,
                completionPercentage: totalStudents > 0 ? Math.round((completedCount / totalStudents) * 100) : 0
            };
        });

        console.log(`✅ [Activity] Estado de cuestionarios generado exitosamente para actividad ${activityId}`);

        return res.status(200).send({
            activityId: activityId,
            activityTitle: activity.title,
            totalStudents: totalStudents,
            totalQuestionnaires: questionnaires.length,
            students: studentsStatus,
            activityStats: activityStats,
            generatedAt: new Date().toISOString(),
            note: "Los cuestionarios están asociados al usuario, no a la actividad. Un estudiante que complete un test lo tendrá disponible en todas las actividades."
        });

    } catch (error: any) {
        console.error(`❌ [Activity] Error consultando estado de cuestionarios:`, error);
        return res.status(500).send({
            message: error.message
        });
    }
});

/**
 * Endpoint para verificar rápidamente si un estudiante específico ha completado un cuestionario
 * @route GET /activities/:activityId/students/:studentId/questionnaire/:questionnaireId/status
 * @param {string} activityId - ID de la actividad
 * @param {string} studentId - ID del estudiante  
 * @param {string} questionnaireId - ID del cuestionario
 * @returns {Object} Estado específico de completitud
 */
activitiesRouter.get("/:activityId/students/:studentId/questionnaire/:questionnaireId/status", async (req: Request, res: Response) => {
    const { activityId, studentId, questionnaireId } = req?.params;

    try {
        console.log(`🔍 [Activity] Verificando estado: Estudiante ${studentId}, Cuestionario ${questionnaireId}, Actividad ${activityId}`);

        // Verificar que el estudiante pertenece a la actividad
        const activity = await collections.activities?.findOne({
            _id: new ObjectId(activityId),
            students: new ObjectId(studentId)
        });

        if (!activity) {
            return res.status(404).send({
                message: `Student ${studentId} is not part of activity ${activityId} or activity does not exist`
            });
        }

        // Obtener información del estudiante y verificar si ha completado el cuestionario (verificación global)
        const student = await collections.users?.findOne({ _id: new ObjectId(studentId) });
        const questionnaire = await collections.questionnaires?.findOne({ _id: new ObjectId(questionnaireId) });

        if (!student) {
            return res.status(404).send({
                message: `Student with id ${studentId} does not exist`
            });
        }

        if (!questionnaire) {
            return res.status(404).send({
                message: `Questionnaire with id ${questionnaireId} does not exist`
            });
        }

        // Verificar si ha completado el cuestionario (búsqueda global en el perfil del usuario)
        const hasCompleted = (student.askedQuestionnaires?.some(aq => aq.questionnaire.equals(new ObjectId(questionnaireId)))) || false;
        
        let result = null;
        let completedAt = null;

        if (hasCompleted && student.askedQuestionnaires) {
            const completedQuest = student.askedQuestionnaires.find(aq => aq.questionnaire.equals(new ObjectId(questionnaireId)));
            result = completedQuest?.result || null;
            completedAt = completedQuest?.completedAt || null;
        }

        console.log(`${hasCompleted ? '✅' : '❌'} [Activity] Estudiante ${student.email} ${hasCompleted ? 'SÍ ha completado' : 'NO ha completado'} el cuestionario ${questionnaire.title}`);

        return res.status(200).send({
            activityId: activityId,
            activityTitle: activity.title,
            studentId: studentId,
            studentName: student.name,
            studentEmail: student.email,
            questionnaireId: questionnaireId,
            questionnaireTitle: questionnaire.title,
            questionnaireType: questionnaire.questionnaireType,
            hasCompleted: hasCompleted,
            result: result,
            completedAt: completedAt,
            note: hasCompleted ? 
                "El estudiante completó este cuestionario (asociado a su perfil, no a la actividad)" : 
                "El estudiante aún no ha completado este cuestionario"
        });

    } catch (error: any) {
        console.error(`❌ [Activity] Error verificando estado específico:`, error);
        return res.status(500).send({
            message: error.message
        });
    }
});

activitiesRouter.use("/:activityId/groups", groupsRouter);

activitiesRouter.use("/:activityId/students", handleActivityStudentsRouter);

/**
 * Endpoint para generar preview/borrador de resultados del algoritmo
 * Permite al profesor ver una simulación de la formación de equipos antes de ejecutar
 * @route GET /activities/:id/algorithm/preview
 * @param {string} id - ID de la actividad
 * @returns {Object} Preview de la formación de equipos
 */
activitiesRouter.get("/:id/algorithm/preview", verifyTeacher, async (req: Request, res: Response) => {
    const activityId = req?.params?.id;

    console.log(`👁️ [AlgorithmPreview] Generando preview para actividad: ${activityId}`);

    try {
        // Validar que la actividad existe y pertenece al profesor
        const activity = await collections.activities?.findOne({ 
            _id: new ObjectId(activityId),
            teacher: new ObjectId(req.session?.authuser as string)
        });

        if (!activity) {
            return res.status(404).send({
                message: `Activity ${activityId} not found or you don't have permission`
            });
        }

        // Verificar que el algoritmo está configurado
        if (!activity.algorithmConfig?.isConfigured) {
            return res.status(400).send({
                message: "Algorithm is not configured for this activity. Please configure it first."
            });
        }

        // Usar la validación completa para verificar el estado
        const validation = await performCompleteValidation(activityId);
        
        if (!validation.canExecuteAlgorithm) {
            return res.status(400).send({
                message: "Algorithm cannot be executed. Please check validation results.",
                validation: validation,
                cannotExecuteReasons: validation.recommendations
            });
        }

        console.log(`✅ [AlgorithmPreview] Validación pasada, generando preview simulado...`);

        // Obtener estudiantes con sus traits BELBIN
        const studentsWithBelbin = await collections.users?.find({
            _id: { $in: activity.students || [] },
            "askedQuestionnaires": {
                $elemMatch: {
                    "result": { $in: ["TW", "CW", "CH", "ME", "CF", "SH", "PL", "RI"] }
                }
            }
        }).toArray();

        if (!studentsWithBelbin || studentsWithBelbin.length === 0) {
            return res.status(400).send({
                message: "No students with completed BELBIN test found"
            });
        }

        const algorithmConfig = activity.algorithmConfig;
        const totalStudents = studentsWithBelbin.length;

        // Validar que tenemos todos los parámetros del profesor
        if (!algorithmConfig.teamSize || !algorithmConfig.minTeams || !algorithmConfig.maxTeams) {
            return res.status(400).send({
                message: "Algorithm configuration is incomplete. Missing teamSize, minTeams, or maxTeams from professor.",
                details: {
                    hasTeamSize: !!algorithmConfig.teamSize,
                    hasMinTeams: !!algorithmConfig.minTeams,
                    hasMaxTeams: !!algorithmConfig.maxTeams
                }
            });
        }

        // Usar EXACTAMENTE los parámetros del profesor, no calcular automáticamente
        console.log(`📊 [AlgorithmPreview] Generando preview con parámetros del profesor:`);
        console.log(`📊 [AlgorithmPreview] - Estudiantes: ${totalStudents}`); 
        console.log(`📊 [AlgorithmPreview] - Tamaño equipo: ${algorithmConfig.teamSize}`);
        console.log(`📊 [AlgorithmPreview] - Equipos min: ${algorithmConfig.minTeams}`);
        console.log(`📊 [AlgorithmPreview] - Equipos max: ${algorithmConfig.maxTeams}`);

        // Generar preview simulado usando parámetros del profesor
        const previewTeams = generateSimulatedTeams(
            studentsWithBelbin, 
            algorithmConfig.teamSize,
            algorithmConfig.minTeams,
            algorithmConfig.maxTeams
        );

        // Analizar la distribución de traits en cada equipo
        const teamsAnalysis = previewTeams.map((team, index) => {
            const teamTraits = team.map(student => {
                const belbinResult = student.askedQuestionnaires?.find((aq: any) => 
                    ["TW", "CW", "CH", "ME", "CF", "SH", "PL", "RI"].includes(aq.result)
                );
                return belbinResult?.result || "Unknown";
            });

            const traitCounts = teamTraits.reduce((acc: any, trait) => {
                acc[trait] = (acc[trait] || 0) + 1;
                return acc;
            }, {});

            return {
                teamNumber: index + 1,
                teamName: `Equipo ${index + 1}`,
                members: team.map(student => ({
                    userId: student._id,
                    userName: student.name,
                    userEmail: student.email,
                    belbinTrait: teamTraits[team.indexOf(student)]
                })),
                teamSize: team.length,
                traitDistribution: traitCounts,
                balanceScore: calculateTeamBalance(teamTraits)
            };
        });

        // Calcular métricas generales del preview
        const overallMetrics = {
            totalStudents: totalStudents,
            totalTeams: previewTeams.length,
            averageTeamSize: Math.round((totalStudents / previewTeams.length) * 10) / 10,
            traitDistributionGlobal: calculateGlobalTraitDistribution(studentsWithBelbin),
            balanceScoreAverage: Math.round((teamsAnalysis.reduce((sum, team) => sum + team.balanceScore, 0) / teamsAnalysis.length) * 100) / 100
        };

        console.log(`🎯 [AlgorithmPreview] Preview generado - Balance promedio: ${overallMetrics.balanceScoreAverage}`);

        return res.status(200).send({
            message: "Algorithm preview generated successfully",
            data: {
                activityId: activityId,
                activityTitle: activity.title,
                isPreview: true,
                previewGeneratedAt: new Date().toISOString(),
                algorithmConfig: activity.algorithmConfig,
                teams: teamsAnalysis,
                metrics: overallMetrics,
                disclaimer: "Esto es una simulación. Los resultados reales del algoritmo pueden diferir.",
                nextSteps: [
                    "Revisar la distribución de equipos",
                    "Verificar el balance de traits BELBIN",
                    "Ejecutar el algoritmo real si está satisfecho",
                    "Modificar configuración si es necesario"
                ]
            }
        });

    } catch (error: any) {
        console.error(`💥 [AlgorithmPreview] Error generando preview:`, error);
        return res.status(500).send({
            message: "Internal server error generating algorithm preview",
            error: error.message
        });
    }
});

/**
 * Función auxiliar para generar equipos simulados de manera balanceada
 * CORREGIDO: Respeta EXACTAMENTE el número de grupos solicitado por el profesor
 * @param students Array de estudiantes con traits BELBIN
 * @param teamSize Tamaño deseado de cada equipo (del profesor)
 * @param minTeams Número mínimo de equipos (del profesor)
 * @param maxTeams Número máximo de equipos (del profesor)
 * @returns Array de equipos simulados
 */
function generateSimulatedTeams(
    students: any[], 
    teamSize: number, 
    minTeams: number, 
    maxTeams: number
): any[][] {
    console.log(`🎲 [SimulatedTeams] Generando equipos simulados para ${students.length} estudiantes`);
    console.log(`🎲 [SimulatedTeams] Parámetros del profesor: ${teamSize} por equipo, ${minTeams}-${maxTeams} equipos`);

    // CRÍTICO: Usar EXACTAMENTE maxTeams (el profesor quiere este número específico)
    const targetTeams = maxTeams;
    console.log(`🎯 [SimulatedTeams] Creando EXACTAMENTE ${targetTeams} equipos como solicitó el profesor`);

    // Agrupar estudiantes por trait BELBIN para distribución balanceada
    const studentsByTrait: any = {};
    students.forEach(student => {
        const belbinResult = student.askedQuestionnaires?.find((aq: any) => 
            ["TW", "CW", "CH", "ME", "CF", "SH", "PL", "RI"].includes(aq.result)
        );
        const trait = belbinResult?.result || "Unknown";
        
        if (!studentsByTrait[trait]) {
            studentsByTrait[trait] = [];
        }
        studentsByTrait[trait].push(student);
    });

    console.log(`📊 [SimulatedTeams] Distribución por traits:`, Object.keys(studentsByTrait).map(trait => 
        `${trait}: ${studentsByTrait[trait].length}`).join(', '));

    const teams: any[][] = [];
    
    // CRÍTICO: Inicializar EXACTAMENTE el número de equipos solicitado
    for (let i = 0; i < targetTeams; i++) {
        teams.push([]);
    }
    
    console.log(`✅ [SimulatedTeams] Inicializados ${teams.length} equipos vacíos`);

    // Distribuir estudiantes de manera balanceada entre TODOS los equipos
    const traits = Object.keys(studentsByTrait);
    let currentTeamIndex = 0;

    // Primera pasada: distribuir estudiantes por traits de manera cíclica
    traits.forEach(trait => {
        const studentsOfTrait = studentsByTrait[trait];
        
        studentsOfTrait.forEach((student: any) => {
            teams[currentTeamIndex].push(student);
            currentTeamIndex = (currentTeamIndex + 1) % targetTeams;
        });
    });

    // Segunda pasada: verificar si algún estudiante quedó sin asignar
    const assignedStudents = new Set();
    teams.forEach(team => {
        team.forEach(student => assignedStudents.add(student));
    });

    const unassignedStudents = students.filter(student => !assignedStudents.has(student));
    
    if (unassignedStudents.length > 0) {
        console.log(`📋 [SimulatedTeams] Asignando ${unassignedStudents.length} estudiantes restantes`);
        
        unassignedStudents.forEach((student, index) => {
            const teamIndex = index % targetTeams;
            teams[teamIndex].push(student);
        });
    }

    // Información final
    const teamSizes = teams.map(team => team.length);
    console.log(`✅ [SimulatedTeams] ${teams.length} equipos generados con tamaños: ${teamSizes.join(', ')}`);
    console.log(`🎯 [SimulatedTeams] TOTAL estudiantes asignados: ${teamSizes.reduce((a, b) => a + b, 0)}/${students.length}`);
    console.log(`✅ [SimulatedTeams] Respetado EXACTAMENTE el número solicitado: ${targetTeams} equipos`);
    
    // Validación final: asegurar que todos los estudiantes estén asignados
    const totalAssigned = teams.reduce((total, team) => total + team.length, 0);
    if (totalAssigned !== students.length) {
        console.error(`🚨 [SimulatedTeams] ERROR: ${students.length - totalAssigned} estudiantes sin asignar`);
    }
    
    return teams;
}

/**
 * Calcula un score de balance para un equipo basado en la diversidad de traits
 * @param traits Array de traits BELBIN del equipo
 * @returns Score de balance (0-1, donde 1 es mejor balance)
 */
function calculateTeamBalance(traits: string[]): number {
    const uniqueTraits = new Set(traits).size;
    const totalTraits = traits.length;
    
    // Balance perfecto sería tener todos traits diferentes
    // Penalizar equipos con muchos traits repetidos
    const diversityScore = uniqueTraits / totalTraits;
    
    // Bonus por tener traits complementarios (esto se puede expandir)
    let complementaryBonus = 0;
    const traitCounts = traits.reduce((acc: any, trait) => {
        acc[trait] = (acc[trait] || 0) + 1;
        return acc;
    }, {});

    // Penalizar si hay más de 2 del mismo trait
    Object.values(traitCounts).forEach((count: any) => {
        if (count > 2) {
            complementaryBonus -= 0.1;
        }
    });

    return Math.max(0, Math.min(1, diversityScore + complementaryBonus));
}

/**
 * Calcula la distribución global de traits en toda la actividad
 * @param students Array de estudiantes
 * @returns Distribución de traits
 */
function calculateGlobalTraitDistribution(students: any[]): any {
    const distribution: any = {};
    
    students.forEach(student => {
        const belbinResult = student.askedQuestionnaires?.find((aq: any) => 
            ["TW", "CW", "CH", "ME", "CF", "SH", "PL", "RI"].includes(aq.result)
        );
        const trait = belbinResult?.result || "Unknown";
        distribution[trait] = (distribution[trait] || 0) + 1;
    });

    return distribution;
}

/**
 * 🐛 ENDPOINT DE DEBUGGING TEMPORAL SIN AUTENTICACIÓN
 * @route GET /activities/:id/debug-no-auth
 * @param {string} id - ID de la actividad
 * @returns {Object} Información detallada de debugging
 */
activitiesRouter.get("/:id/debug-no-auth", async (req: Request, res: Response) => {
    const activityId = req?.params?.id;

    console.log(`🔍 [Debug-NoAuth] Iniciando debugging sin autenticación para actividad: ${activityId}`);

    try {
        // 1. Buscar actividad (sin verificar teacher)
        const activity = await collections.activities?.findOne({ 
            _id: new ObjectId(activityId)
        });

        if (!activity) {
            return res.status(404).send({
                message: `Activity ${activityId} not found`
            });
        }

        // 2. Verificar estudiantes y BELBIN
        const students = await collections.users?.find({
            _id: { $in: activity.students || [] }
        }).toArray();

        const belbinQuestionnaireId = "6718b2263e29ad19c0e0c61f";
        const studentsWithBelbin = students?.filter(student => {
            return student.askedQuestionnaires?.some(q => 
                q.questionnaire.toString() === belbinQuestionnaireId && q.result
            );
        }) || [];

        const studentsWithoutBelbin = students?.filter(student => {
            return !student.askedQuestionnaires?.some(q => 
                q.questionnaire.toString() === belbinQuestionnaireId && q.result
            );
        }) || [];

        // 3. Verificar configuración del algoritmo
        const algorithmConfig = activity.algorithmConfig || {};
        const hasValidConfig = !!(algorithmConfig as any).teamSize &&
                              !!(algorithmConfig as any).minTeams &&
                              !!(algorithmConfig as any).maxTeams;

        // 4. Verificar archivos
        const { generateAlgorithmFileName, algorithmFileExists } = await import("../functions/algorithm-functions");
        
        const algorithmFile = {
            exists: algorithmFileExists(activityId),
            path: generateAlgorithmFileName(activityId)
        };

        const fs = require('fs');
        const path = require('path');
        
        const pythonFile = {
            exists: fs.existsSync(path.join(__dirname, '..', 'scripts', 'pyteamformation', 'equipos_lola.py')),
            path: path.join(__dirname, '..', 'scripts', 'pyteamformation', 'equipos_lola.py')
        };

        const instancesDirectory = {
            exists: fs.existsSync(path.join(__dirname, '..', 'scripts', 'pyteamformation', 'instances')),
            path: path.join(__dirname, '..', 'scripts', 'pyteamformation', 'instances')
        };

        console.log(`✅ [Debug-NoAuth] Debugging completado para actividad: ${activityId}`);

        return res.status(200).send({
            debug: {
                activity: {
                    id: activityId,
                    title: activity.title,
                    status: activity.algorithmStatus || 'not-configured',
                    updatedAt: activity.updatedAt
                },
                students: {
                    total: students?.length || 0,
                    withBelbin: studentsWithBelbin.length,
                    withoutBelbin: studentsWithoutBelbin.map(s => ({
                        id: s._id,
                        name: s.name,
                        email: s.email
                    })),
                    completionPercentage: Math.round((studentsWithBelbin.length / (students?.length || 1)) * 100)
                },
                algorithmConfig: {
                    hasValidConfig: hasValidConfig,
                    config: algorithmConfig,
                    configuredAt: (algorithmConfig as any).lastConfiguredAt || null
                },
                algorithmFile: algorithmFile,
                pythonFile: pythonFile,
                instancesDirectory: instancesDirectory,
                systemInfo: {
                    debugVersion: "no-auth-temp",
                    timestamp: new Date().toISOString(),
                    readyToExecute: hasValidConfig && studentsWithBelbin.length === students?.length && algorithmFile.exists
                }
            }
        });

    } catch (error: any) {
        console.error(`💥 [Debug-NoAuth] Error en debugging:`, error);
        return res.status(500).send({
            message: "Debug error",
            error: error.message,
            activityId: activityId
        });
    }
});

/**
 * 🐛 ENDPOINT DE DEBUGGING PARA TROUBLESHOOTING
 * Endpoint de debugging para obtener información completa del estado de una actividad
 * Útil para troubleshooting cuando algo no funciona
 * @route GET /activities/:id/debug
 * @param {string} id - ID de la actividad
 * @returns {Object} Información detallada de debugging
 */
activitiesRouter.get("/:id/debug", verifyTeacher, async (req: Request, res: Response) => {
    const activityId = req?.params?.id;

    console.log(`🐛 [Debug] Iniciando debugging para actividad: ${activityId}`);

    try {
        // 1. Obtener la actividad
        const activity = await collections.activities?.findOne({
            _id: new ObjectId(activityId),
            teacher: new ObjectId((req.session as any)?.authuser)
        });

        if (!activity) {
            return res.status(404).send({
                error: "Activity not found",
                message: `Activity with id ${activityId} not found or doesn't belong to current teacher`
            });
        }

        // 2. Obtener información detallada de estudiantes
        const studentIds = activity.students || [];
        const students = await collections.users?.find({
            _id: { $in: studentIds }
        }).toArray();

        // 3. Analizar datos BELBIN
        const belbinQuestionnaireId = "6718b2263e29ad19c0e0c61f";
        const studentsWithBelbin = students?.filter(student => {
            return student.askedQuestionnaires?.some(q => 
                q.questionnaire.toString() === belbinQuestionnaireId && q.result
            );
        }) || [];

        const studentsWithoutBelbin = students?.filter(student => {
            return !student.askedQuestionnaires?.some(q => 
                q.questionnaire.toString() === belbinQuestionnaireId && q.result
            );
        }) || [];

        // 4. Extraer traits BELBIN de cada estudiante
        const belbinDetails = studentsWithBelbin.map(student => {
            const belbinResponse = student.askedQuestionnaires?.find(q => 
                q.questionnaire.toString() === belbinQuestionnaireId
            );

            return {
                studentId: student._id,
                email: student.email,
                name: student.name,
                belbinRole: belbinResponse?.result,
                completedAt: belbinResponse?.completedAt
            };
        });

        // 5. Verificar configuración del algoritmo
        const algorithmConfig = activity.algorithmConfig || {};
        const hasValidConfig = !!(algorithmConfig as any).teamSize &&
                              !!(algorithmConfig as any).minTeams &&
                              !!(algorithmConfig as any).maxTeams;

        // 6. Verificar archivos JSON del algoritmo
        const { generateAlgorithmFileName, getAlgorithmFilePath, algorithmFileExists, performCompleteValidation, getActivityMembersWithTraits } = await import("../functions/algorithm-functions");

        const algorithmFileName = generateAlgorithmFileName(activityId);
        const algorithmFilePath = getAlgorithmFilePath(activityId);
        const fileExists = await algorithmFileExists(activityId);

        // 7. Realizar validación completa
        let validationResult: any;
        try {
            validationResult = await performCompleteValidation(activityId);
        } catch (validationError: any) {
            validationResult = {
                isValid: false,
                errors: [`Validation error: ${validationError.message}`],
                warnings: [],
                recommendations: ["Fix validation errors first"]
            };
        }

        // 8. Obtener miembros con traits para el algoritmo
        let algorithmMembers: any;
        try {
            algorithmMembers = await getActivityMembersWithTraits(activityId);
        } catch (membersError: any) {
            algorithmMembers = {
                error: `Error getting members: ${membersError.message}`
            };
        }

        // 9. Compilar información de debugging
        const debugInfo = {
            timestamp: new Date().toISOString(),
            activity: {
                id: activityId,
                title: activity.title,
                description: activity.description,
                algorithmStatus: activity.algorithmStatus || 'not-configured',
                createdAt: activity.createdAt,
                updatedAt: activity.updatedAt
            },
            students: {
                total: studentIds.length,
                withBelbin: studentsWithBelbin.length,
                withoutBelbin: studentsWithoutBelbin.length,
                completionPercentage: studentIds.length > 0 ? 
                    Math.round((studentsWithBelbin.length / studentIds.length) * 100) : 0,
                belbinDetails: belbinDetails,
                studentsWithoutBelbin: studentsWithoutBelbin.map(s => ({
                    id: s._id,
                    email: s.email,
                    name: s.name
                }))
            },
            algorithmConfig: {
                hasValidConfig: hasValidConfig,
                config: algorithmConfig,
                configuredAt: (algorithmConfig as any).lastConfiguredAt || null
            },
            algorithmFile: {
                fileName: algorithmFileName,
                filePath: algorithmFilePath,
                exists: fileExists,
                canGenerate: studentsWithBelbin.length > 0 && hasValidConfig
            },
            validation: validationResult,
            algorithmMembers: algorithmMembers,
            systemChecks: {
                mongoConnection: !!collections.activities,
                algorithmFunctions: true,
                pythonScriptPath: "src/scripts/algorithm.py"
            }
        };

        console.log(`✅ [Debug] Debugging completado para actividad: ${activityId}`);
        console.log(`📊 [Debug] Resumen: ${studentsWithBelbin.length}/${studentIds.length} con BELBIN, Config válido: ${hasValidConfig}, Archivo existe: ${fileExists}`);

        return res.status(200).send({
            success: true,
            debug: debugInfo
        });

    } catch (error: any) {
        console.error(`💥 [Debug] Error en debugging:`, error);
        return res.status(500).send({
            success: false,
            error: "Debug endpoint failed",
            message: error.message,
            stack: error.stack
        });
    }
});

/**
 * 🧪 ENDPOINT DE TESTING DIRECTO - SIMULA FRONTEND
 * Endpoint de testing que simula exactamente lo que haría el frontend
 * Útil para debugging sin depender del frontend
 * @route POST /activities/:id/test-create-groups
 * @param {string} id - ID de la actividad
 * @returns {Object} Resultado del testing
 */
activitiesRouter.post("/:id/test-create-groups", verifyTeacher, async (req: Request, res: Response) => {
    const activityId = req?.params?.id;

    console.log(`🧪 [TestCreateGroups] ==========================================`);
    console.log(`🧪 [TestCreateGroups] TESTING DIRECTO - CREAR GRUPOS`);
    console.log(`🧪 [TestCreateGroups] Actividad: ${activityId}`);
    console.log(`🧪 [TestCreateGroups] Simulando comportamiento del frontend`);
    console.log(`🧪 [TestCreateGroups] ==========================================`);

    interface TestStep {
        step: number;
        name: string;
        success: boolean;
        data?: any;
        error?: string;
    }

    try {
        const testResults = {
            timestamp: new Date().toISOString(),
            activityId: activityId,
            steps: [] as TestStep[]
        };

        // Paso 1: Verificar que la actividad existe
        console.log(`🧪 [TestCreateGroups] Paso 1: Verificando actividad...`);
        const activity = await collections.activities?.findOne({
            _id: new ObjectId(activityId),
            teacher: new ObjectId((req.session as any)?.authuser)
        });

        if (!activity) {
            testResults.steps.push({
                step: 1,
                name: "Verificar actividad",
                success: false,
                error: "Actividad no encontrada o sin permisos"
            });
            return res.status(404).send(testResults);
        }

        testResults.steps.push({
            step: 1,
            name: "Verificar actividad",
            success: true,
            data: { title: activity.title, studentsCount: activity.students?.length || 0 }
        });

        // Paso 2: Verificar estado de configuración
        console.log(`🧪 [TestCreateGroups] Paso 2: Verificando configuración...`);
        const hasConfig = activity.algorithmConfig?.isConfigured;
        testResults.steps.push({
            step: 2,
            name: "Verificar configuración",
            success: !!hasConfig,
            data: {
                hasConfig: !!activity.algorithmConfig,
                isConfigured: hasConfig,
                config: activity.algorithmConfig
            }
        });

        if (!hasConfig) {
            console.log(`🧪 [TestCreateGroups] ❌ Configuración faltante`);
            return res.status(400).send(testResults);
        }

        // Paso 3: Verificar datos BELBIN
        console.log(`🧪 [TestCreateGroups] Paso 3: Verificando datos BELBIN...`);
        const students = await collections.users?.find({
            _id: { $in: activity.students || [] }
        }).toArray();

        const belbinQuestionnaireId = "6718b2263e29ad19c0e0c61f";
        const studentsWithBelbin = students?.filter(student => {
            return student.askedQuestionnaires?.some(q => 
                q.questionnaire.toString() === belbinQuestionnaireId && q.result
            );
        }) || [];

        const studentsWithoutBelbin = students?.filter(student => {
            return !student.askedQuestionnaires?.some(q => 
                q.questionnaire.toString() === belbinQuestionnaireId && q.result
            );
        }) || [];

        const belbinDetails = studentsWithBelbin.map(student => {
            const belbinResponse = student.askedQuestionnaires?.find(q => 
                q.questionnaire.toString() === belbinQuestionnaireId
            );

            return {
                email: student.email,
                name: student.name,
                belbinRole: belbinResponse?.result,
                completedAt: belbinResponse?.completedAt
            };
        });

        const totalStudents = students?.length || 0;
        testResults.steps.push({
            step: 3,
            name: "Verificar datos BELBIN",
            success: studentsWithoutBelbin.length === 0,
            data: {
                totalStudents: totalStudents,
                studentsWithBelbin: studentsWithBelbin.length,
                studentsWithoutBelbin: studentsWithoutBelbin.length,
                completionPercentage: totalStudents > 0 ? Math.round((studentsWithBelbin.length / totalStudents) * 100) : 0,
                belbinDetails: belbinDetails,
                missingStudents: studentsWithoutBelbin.map(s => ({ email: s.email, name: s.name }))
            }
        });

        if (studentsWithoutBelbin.length > 0) {
            console.log(`🧪 [TestCreateGroups] ❌ Estudiantes sin BELBIN: ${studentsWithoutBelbin.length}`);
            return res.status(400).send(testResults);
        }

        // Paso 4: Verificar archivo JSON del algoritmo
        console.log(`🧪 [TestCreateGroups] Paso 4: Verificando archivo JSON...`);
        const { algorithmFileExists, createAlgorithmFileForActivity, generateAlgorithmFileName } = await import("../functions/algorithm-functions");
        
        let fileExists = await algorithmFileExists(activityId);
        const fileName = generateAlgorithmFileName(activityId);

        if (!fileExists) {
            console.log(`🧪 [TestCreateGroups] Generando archivo JSON...`);
            try {
                const config = activity.algorithmConfig;
                
                if (!config?.teamSize || !config?.minTeams || !config?.maxTeams) {
                    testResults.steps.push({
                        step: 4,
                        name: "Verificar/crear archivo JSON",
                        success: false,
                        error: "Configuración del algoritmo incompleta - faltan teamSize, minTeams o maxTeams"
                    });
                    return res.status(400).send(testResults);
                }

                const jsonResult = await createAlgorithmFileForActivity(
                    activityId, 
                    config.teamSize,
                    config.minTeams,
                    config.maxTeams,
                    config.additionalConstraints || []
                );
                fileExists = true;
                testResults.steps.push({
                    step: 4,
                    name: "Verificar/crear archivo JSON",
                    success: true,
                    data: {
                        fileExists: true,
                        fileName: fileName,
                        generated: true,
                        usedProfessorParams: {
                            teamSize: config.teamSize,
                            minTeams: config.minTeams,
                            maxTeams: config.maxTeams
                        }
                    }
                });
            } catch (jsonError: any) {
                testResults.steps.push({
                    step: 4,
                    name: "Verificar/crear archivo JSON",
                    success: false,
                    error: jsonError.message
                });
                return res.status(500).send(testResults);
            }
        } else {
            testResults.steps.push({
                step: 4,
                name: "Verificar/crear archivo JSON",
                success: true,
                data: { fileExists: true, fileName: fileName, generated: false }
            });
        }

        // Paso 5: Simular exactamente lo que hace el frontend - ejecutar algoritmo
        console.log(`🧪 [TestCreateGroups] Paso 5: EJECUTANDO ALGORITMO (simulando frontend)...`);
        
        // Verificar que no esté ya ejecutándose
        if (activity.algorithmStatus === 'running') {
            testResults.steps.push({
                step: 5,
                name: "Ejecutar algoritmo",
                success: false,
                error: "Algoritmo ya en ejecución"
            });
            return res.status(409).send(testResults);
        }

        // Preparar datos exactamente como lo hace el endpoint principal
        const workerData = {
            activityId: activityId,
            teamSize: activity.algorithmConfig?.teamSize || 4,
            customConstraints: activity.algorithmConfig?.additionalConstraints || []
        };

        // Actualizar estado a 'running'
        await collections.activities?.updateOne(
            { _id: new ObjectId(activityId) },
            {
                $set: {
                    algorithmStatus: 'running',
                    updatedAt: new Date()
                }
            }
        );

        // Enviar notificación (si no falla)
        try {
            await addUserNotification(new ObjectId(activity.teacher), {
                title: '🧪 Algoritmo de formación iniciado (TEST)',
                description: `Test directo del algoritmo para la actividad "${activity.title}". Tiempo estimado: ${estimateExecutionTime(activity.students?.length || 0)} minutos.`,
                link: `/activities/${activityId}`
            });
        } catch (notifError: any) {
            console.log(`🧪 [TestCreateGroups] ⚠️ Error en notificación:`, notifError.message);
        }

        // Ejecutar worker
        console.log(`🧪 [TestCreateGroups] Iniciando worker con datos:`, workerData);
        
        if (activeWorkers < MAX_WORKERS) {
            startAlgorithmWorker(workerData);
            testResults.steps.push({
                step: 5,
                name: "Ejecutar algoritmo",
                success: true,
                data: {
                    workerData: workerData,
                    activeWorkers: activeWorkers,
                    maxWorkers: MAX_WORKERS,
                    queuePosition: 0,
                    estimatedTime: estimateExecutionTime(activity.students?.length || 0)
                }
            });
        } else {
            taskQueue.push(workerData);
            testResults.steps.push({
                step: 5,
                name: "Ejecutar algoritmo",
                success: true,
                data: {
                    workerData: workerData,
                    activeWorkers: activeWorkers,
                    maxWorkers: MAX_WORKERS,
                    queuePosition: taskQueue.length,
                    estimatedTime: estimateExecutionTime(activity.students?.length || 0),
                    queued: true
                }
            });
        }

        console.log(`🧪 [TestCreateGroups] ==========================================`);
        console.log(`🧪 [TestCreateGroups] TEST COMPLETADO EXITOSAMENTE`);
        console.log(`🧪 [TestCreateGroups] Algoritmo iniciado para: "${activity.title}"`);
        console.log(`🧪 [TestCreateGroups] Worker estado: ${activeWorkers}/${MAX_WORKERS}`);
        console.log(`🧪 [TestCreateGroups] ==========================================`);

        return res.status(200).send({
            success: true,
            message: "Test directo completado - Algoritmo iniciado exitosamente",
            testResults: testResults,
            finalState: {
                activityId: activityId,
                activityTitle: activity.title,
                algorithmStatus: 'running',
                studentsCount: activity.students?.length || 0,
                teamSize: activity.algorithmConfig?.teamSize || 4,
                startedAt: new Date().toISOString()
            }
        });

    } catch (error: any) {
        console.log(`🧪 [TestCreateGroups] ==========================================`);
        console.log(`🧪 [TestCreateGroups] ERROR EN TEST DIRECTO`);
        console.log(`🧪 [TestCreateGroups] Error: ${error.message}`);
        console.log(`🧪 [TestCreateGroups] Stack: ${error.stack}`);
        console.log(`🧪 [TestCreateGroups] ==========================================`);

        return res.status(500).send({
            success: false,
            error: "Error en test directo",
            message: error.message,
            details: {
                activityId: activityId,
                timestamp: new Date().toISOString()
            }
        });
    }
});

/**
 * Endpoint de debug sin autenticación para testing del sistema corregido
 * SOLO PARA DESARROLLO - NO USAR EN PRODUCCIÓN
 */
activitiesRouter.post("/:id/debug-no-auth", async (req: Request, res: Response) => {
    const activityId = req?.params?.id;
    const frontendData = req.body; 

    console.log(`🧪 [DebugNoAuth] ==========================================`);
    console.log(`🧪 [DebugNoAuth] TESTING SISTEMA CORREGIDO SIN AUTH`);
    console.log(`🧪 [DebugNoAuth] Actividad: ${activityId}`);
    console.log(`🧪 [DebugNoAuth] Datos del frontend:`, frontendData);
    console.log(`🧪 [DebugNoAuth] ==========================================`);

    try {
        // 1. Verificar actividad
        const activity = await collections.activities?.findOne({ _id: new ObjectId(activityId) });
        if (!activity) {
            return res.status(404).send({ message: "Activity not found" });
        }

        // 2. Procesar igual que el endpoint principal
        const { algorithmData, selectedStudentIds, groupConfigurations, restrictions } = frontendData;
        
        if (!algorithmData || !selectedStudentIds) {
            return res.status(400).send({
                message: "No algorithm data or selected students received from frontend"
            });
        }

        console.log(`✅ [DebugNoAuth] Datos recibidos: ${selectedStudentIds.length} estudiantes seleccionados`);

        // 3. Obtener estudiantes con BELBIN usando los IDs seleccionados
        const selectedStudents = await collections.users?.find({
            _id: { $in: selectedStudentIds.map((id: string) => new ObjectId(id)) }
        }).toArray();

        if (!selectedStudents || selectedStudents.length === 0) {
            return res.status(400).send({ message: "Selected students not found" });
        }

        // 4. Obtener traits BELBIN de los estudiantes seleccionados
        const belbinQuestionnaireId = "6718b2263e29ad19c0e0c61f";
        const membersWithTraits = selectedStudents.map(student => {
            const belbinQuestionnaire = student.askedQuestionnaires?.find(aq => 
                aq.questionnaire.toString() === belbinQuestionnaireId && aq.result
            );

            const primaryTrait = belbinQuestionnaire?.result || "";
            const traits = primaryTrait ? [primaryTrait] : [];

            console.log(`📝 [DebugNoAuth] Estudiante ${student.email}: traits=${traits.join(', ')}`);

            return { traits: traits };
        });

        // 5. Construir algorithmData correcto
        const processedAlgorithmData = { 
            ...algorithmData,
            number_members: membersWithTraits.length,
            members: membersWithTraits
        };
        
        console.log(`✅ [DebugNoAuth] AlgorithmData corregido:`);
        console.log(`📊 [DebugNoAuth] - Miembros: ${processedAlgorithmData.number_members}`);
        console.log(`📊 [DebugNoAuth] - Traits obtenidos: ${membersWithTraits.length}`);

        // 6. Procesar restricciones si las hay
        if (restrictions?.mustNotBeTogether?.length > 0) {
            const studentIdToIndex = new Map();
            selectedStudents.forEach((student, index) => {
                studentIdToIndex.set(student._id.toString(), index);
            });

            restrictions.mustNotBeTogether.forEach((restriction: any[], restrictionIndex: number) => {
                const memberIndices = restriction
                    .map(userId => studentIdToIndex.get(userId))
                    .filter(index => index !== undefined);

                if (memberIndices.length >= 2) {
                    for (let i = 0; i < memberIndices.length; i++) {
                        for (let j = i + 1; j < memberIndices.length; j++) {
                            processedAlgorithmData.constraints.push({
                                type: "DifferentTeam",
                                name: `debug_must_not_${restrictionIndex}_${i}_${j}`,
                                members: [memberIndices[i], memberIndices[j]]
                            });
                        }
                    }
                    console.log(`✅ [DebugNoAuth] Añadidas restricciones DifferentTeam`);
                }
            });
        }

        // 7. Generar archivo JSON
        const { saveAlgorithmJSON } = await import("../functions/algorithm-functions");
        const filePath = await saveAlgorithmJSON(activityId, processedAlgorithmData);
        
        if (!filePath) {
            return res.status(500).send({ message: "Failed to generate JSON file" });
        }

        console.log(`✅ [DebugNoAuth] Archivo JSON generado: ${filePath}`);
        
        return res.status(200).send({
            success: true,
            message: 'Debug test completed successfully',
            data: {
                activityId: activityId,
                studentsProcessed: membersWithTraits.length,
                constraintsGenerated: processedAlgorithmData.constraints.length,
                traitsFound: membersWithTraits.filter(m => m.traits.length > 0).length,
                jsonFileGenerated: !!filePath,
                filePath: filePath,
                systemInfo: {
                    debugMode: true,
                    dataSource: 'frontend_corrected_system'
                }
            }
        });

    } catch (error: any) {
        console.error(`💥 [DebugNoAuth] Error:`, error);
        return res.status(500).send({
            success: false,
            message: "Debug test failed",
            error: error.message
        });
    }
});

/**
 * 🔥 ENDPOINT CRÍTICO: Verificar y actualizar estado de completitud Belbin
 * Este endpoint verifica automáticamente si todos los estudiantes han completado Belbin
 * y actualiza el estado de la actividad en tiempo real, emitiendo eventos WebSocket
 * @route POST /activities/:id/refresh-belbin-status
 */
activitiesRouter.post("/:id/refresh-belbin-status", async (req: Request, res: Response) => {
    const activityId = req?.params?.id;
    const authUserId = req.session?.authuser as string;

    console.log(`🔄 [RefreshBelbin] ==========================================`);
    console.log(`🔄 [RefreshBelbin] VERIFICANDO ESTADO BELBIN PARA ACTIVIDAD: ${activityId}`);
    console.log(`🔄 [RefreshBelbin] Usuario: ${authUserId}`);
    console.log(`🔄 [RefreshBelbin] Timestamp: ${new Date().toISOString()}`);
    console.log(`🔄 [RefreshBelbin] ==========================================`);

    try {
        // Obtener la actividad
        const activity = await collections.activities?.findOne({ _id: new ObjectId(activityId) });

        if (!activity) {
            return res.status(404).send({
                message: `Activity with id ${activityId} not found`
            });
        }

        const totalStudents = activity.students?.length || 0;
        console.log(`📊 [RefreshBelbin] Total estudiantes en actividad: ${totalStudents}`);

        if (totalStudents === 0) {
            console.log(`⚠️ [RefreshBelbin] No hay estudiantes en la actividad`);
            return res.status(200).send({
                message: "No students in activity",
                data: {
                    activityId,
                    totalStudents: 0,
                    completedBelbin: 0,
                    allCompleted: false,
                    algorithmStatus: 'not-configured'
                }
            });
        }

        // Verificar completitud de Belbin estudiante por estudiante
        console.log(`🔍 [RefreshBelbin] Verificando completitud de test Belbin...`);
        
        let studentsWithBelbin = 0;
        const studentDetails = [];

        for (const studentId of activity.students || []) {
            const student = await collections.users?.findOne({ _id: studentId });
            if (student) {
                const hasBelbin = student.askedQuestionnaires?.some(
                    q => q.questionnaire.toString() === process.env.BELBIN_QUESTIONNAIRE_ID && q.result
                );
                if (hasBelbin) {
                    studentsWithBelbin++;
                }
                studentDetails.push({
                    id: studentId.toString(),
                    name: student.name,
                    email: student.email,
                    hasBelbin: hasBelbin || false
                });
            }
        }

        const allCompleted = studentsWithBelbin === totalStudents;
        const completionPercentage = totalStudents > 0 ? Math.round((studentsWithBelbin / totalStudents) * 100) : 0;

        console.log(`📊 [RefreshBelbin] Estudiantes con Belbin: ${studentsWithBelbin}/${totalStudents} (${completionPercentage}%)`);
        console.log(`✅ [RefreshBelbin] Todos completaron: ${allCompleted}`);

        // Determinar nuevo estado del algoritmo
        let newAlgorithmStatus = activity.algorithmStatus || 'not-configured';
        const hasConfig = activity.algorithmConfig?.isConfigured;

        if (hasConfig && allCompleted) {
            newAlgorithmStatus = 'ready';
        } else if (hasConfig && !allCompleted) {
            newAlgorithmStatus = 'configured';
        }

        // Actualizar actividad solo si hay cambios
        let wasUpdated = false;
        if (activity.algorithmStatus !== newAlgorithmStatus) {
            await collections.activities?.updateOne(
                { _id: new ObjectId(activityId) },
                { 
                    $set: { 
                        algorithmStatus: newAlgorithmStatus,
                        updatedAt: new Date()
                    }
                }
            );
            wasUpdated = true;
            console.log(`🔄 [RefreshBelbin] Estado actualizado: ${activity.algorithmStatus} → ${newAlgorithmStatus}`);
        }

        // Verificar si se puede generar archivo del algoritmo
        let fileGenerated = false;
        let filePath = null;

        if (hasConfig && allCompleted) {
            console.log(`🔄 [RefreshBelbin] Verificando generación de archivo de algoritmo...`);
            await handleActivityChange(activityId, 'student-added', {
                studentsWithBelbin,
                totalStudents,
                allCompleted,
                checkedBy: authUserId,
                checkedAt: new Date().toISOString()
            });

            fileGenerated = algorithmFileExists(activityId);
            if (fileGenerated) {
                filePath = generateAlgorithmFileName(activityId);
                console.log(`✅ [RefreshBelbin] Archivo de algoritmo disponible: ${filePath}`);
            }
        }

        // 🌐 WebSocket: Emitir evento de actualización al profesor
        webSocketService.emitToUser(authUserId, 'activity-belbin-status-updated', {
            activityId,
            title: activity.title,
            totalStudents,
            completedBelbin: studentsWithBelbin,
            completionPercentage,
            allCompleted,
            algorithmStatus: newAlgorithmStatus,
            fileGenerated,
            canRunAlgorithm: newAlgorithmStatus === 'ready' && fileGenerated,
            wasUpdated,
            timestamp: new Date().toISOString()
        });

        // 🌐 WebSocket: Emitir a estudiantes de la actividad si hay cambios importantes
        if (activity.students?.length && (wasUpdated || allCompleted)) {
            const studentIds = activity.students.map(id => id.toString());
            webSocketService.emitToUsers(studentIds, 'activity-status-changed', {
                activityId,
                title: activity.title,
                algorithmStatus: newAlgorithmStatus,
                allStudentsCompleted: allCompleted,
                message: allCompleted ? 
                    'Todos los estudiantes han completado el test Belbin' :
                    `${studentsWithBelbin}/${totalStudents} estudiantes han completado el test Belbin`,
                timestamp: new Date().toISOString()
            });
        }

        // Respuesta detallada
        return res.status(200).send({
            message: "Belbin status refreshed successfully",
            data: {
                activityId,
                activityTitle: activity.title,
                totalStudents,
                completedBelbin: studentsWithBelbin,
                completionPercentage,
                allCompleted,
                algorithmStatus: newAlgorithmStatus,
                previousStatus: activity.algorithmStatus,
                wasUpdated,
                hasConfiguration: hasConfig,
                fileGenerated,
                filePath,
                canRunAlgorithm: newAlgorithmStatus === 'ready' && fileGenerated,
                studentDetails: studentDetails.map(s => ({
                    name: s.name,
                    email: s.email,
                    hasBelbin: s.hasBelbin
                })),
                checkedAt: new Date().toISOString(),
                checkedBy: authUserId
            }
        });

    } catch (error: any) {
        console.error(`💥 [RefreshBelbin] Error verificando estado Belbin:`, error);
        return res.status(500).send({
            message: "Error refreshing Belbin status",
            error: error.message,
            activityId
        });
    }
});

/**
 * 🚀 NUEVA RUTA: Confirmar grupos en lote y enviar notificaciones
 * POST /api/activities/:id/groups/confirm
 * Esta ruta se ejecuta cuando el profesor aprueba los grupos del algoritmo
 */
activitiesRouter.post("/:id/groups/confirm", verifyTeacher, async (req: Request, res: Response) => {
    const activityId = req.params.id;
    const teacherId = req.session?.authuser as string;
    const { groupIds } = req.body; // Opcional: IDs específicos de grupos a confirmar

    console.log(`✅ [ConfirmGroupsAPI] Solicitud de confirmación de grupos:`);
    console.log(`   📋 Actividad: ${activityId}`);
    console.log(`   👨‍🏫 Profesor: ${teacherId}`);
    console.log(`   🎯 Grupos específicos: ${groupIds ? groupIds.length : 'todos los draft'}`);

    try {
        // Verificar que la actividad existe y el profesor tiene permisos
        const activity = await collections.activities?.findOne({ 
            _id: new ObjectId(activityId),
            teacher: new ObjectId(teacherId)
        });

        if (!activity) {
            console.error(`❌ [ConfirmGroupsAPI] Actividad no encontrada o sin permisos: ${activityId}`);
            res.status(404).json({
                success: false,
                message: "Actividad no encontrada o sin permisos"
            });
            return;
        }

        // Convertir groupIds si se proporcionaron
        const groupObjectIds = groupIds ? groupIds.map((id: string) => new ObjectId(id)) : undefined;

        // Ejecutar la confirmación de grupos
        const result = await confirmGroupsAndNotify(activityId, teacherId, groupObjectIds);

        console.log(`🎉 [ConfirmGroupsAPI] Confirmación exitosa:`, result);

        // Responder con éxito
        res.status(200).json({
            success: true,
            message: "Grupos confirmados exitosamente",
            data: {
                confirmedCount: result.confirmedCount,
                notifiedStudents: result.notifiedStudents,
                activityId: activityId,
                timestamp: new Date().toISOString()
            }
        });
        return;

    } catch (error: any) {
        console.error(`💥 [ConfirmGroupsAPI] Error confirmando grupos:`, error);

        res.status(500).json({
            success: false,
            message: "Error interno confirmando grupos",
            error: error.message
        });
        return;
    }
});

export default activitiesRouter;