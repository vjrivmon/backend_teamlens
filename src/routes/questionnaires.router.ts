import express, { Request, Response } from "express";
import { ObjectId } from "mongodb";
import { collections } from "../services/database.service";
import { webSocketService } from "../services/websocket.service";
import Questionnaire from "../models/questionnaire";
import User from "../models/user";
import { 
    createAlgorithmFileForActivity,
    validateAllStudentsCompletedBelbin,
    algorithmFileExists,
    handleActivityChange
} from "../functions/algorithm-functions";

export const questionnairesRouter = express.Router();

questionnairesRouter.get("/", async (_req: Request, res: Response) => {
    try {
        const questionnaires = await collections.questionnaires?.find<Questionnaire[]>({ enabled: true }).toArray();
        res.status(200).send(questionnaires);
    } catch (error: any) {
        res.status(500).send({
            message: error.message
        });
    }
});

questionnairesRouter.get("/asked", async (req: Request, res: Response) => {
    const authUserId = req.session?.authuser as string;
    
    try {
        const user = await collections.users?.findOne<User>({ _id: new ObjectId(authUserId) });

        if(!user) {
            res.status(404).send({
                message: `User with id ${authUserId} does not exist`
            });
        }

        res.status(200).send(user?.askedQuestionnaires ?? []);

    } catch (error: any) {
        res.status(500).send({
            message: error.message
        });
    }
});

questionnairesRouter.get("/:id", async (req: Request, res: Response) => {
    const id = req?.params?.id;

    try {
        const query = { _id: new ObjectId(id) };
        const questionnaire = await collections.questionnaires?.findOne<Questionnaire>(query);

        if (questionnaire) {
            res.status(200).send(questionnaire);
        }

    } catch (error) {
        res.status(404).send({
            message: `Unable to find matching document with id: ${id}`
        });
    }
});

questionnairesRouter.post("/", async (req: Request, res: Response) => {
    try {
        const newQuestionnaire = req.body as Questionnaire;
        const result = await collections.questionnaires?.insertOne(newQuestionnaire);

        result
            ? res.status(201).send({
                message: `Successfully created a new questionnaire with id ${result.insertedId}`
            })
            : res.status(500).send({
                message: "Failed to create a new questionnaire."
            })

    } catch (error: any) {
        console.error(error);
        res.status(400).send({
            message: error.message
        });
    }
});

questionnairesRouter.put("/:id", async (req: Request, res: Response) => {
    const id = req?.params?.id;

    try {
        const updatedQuestionnaire: Questionnaire = req.body as Questionnaire;
        const query = { _id: new ObjectId(id) };

        const result = await collections.questionnaires?.updateOne(query, { $set: updatedQuestionnaire });

        if (result && result.modifiedCount) {
            res.status(202).send({
                message: `Successfully updated questionnaire with id ${id}`
            });
        } else if (!result) {
            res.status(400).send({
                message: `Failed to update questionnaire with id ${id}`
            });
        } else if (result.matchedCount) {
            res.status(304).send({
                message: `Questionnaire with id ${id} is already up to date`
            });
        } else {
            res.status(404).send({
                message: `Questionnaire with id ${id} does not exist`
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
 * Endpoint para submit anónimo de cuestionarios (sin autenticación)
 * Permite a estudiantes responder cuestionarios desde enlaces de correo
 * @route PUT /questionnaires/:id/submit-anonymous
 */
questionnairesRouter.put("/:id/submit-anonymous", async (req: Request, res: Response) => {
    const id = req?.params?.id;
    const { email, ...testValues } = req.body; // Extraer email de los datos

    console.log(`🎯 [QuestionnairesAnonymous] Submit anónimo iniciado para cuestionario ${id}`);
    console.log(`📧 [QuestionnairesAnonymous] Email proporcionado: ${email}`);

    try {
        // Validar que se proporcionó un email
        if (!email) {
            res.status(400).send({
                message: "Email es requerido para submits anónimos"
            });
            return;
        }

        // Validar formato de email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            res.status(400).send({
                message: "Formato de email inválido"
            });
            return;
        }

        // Verificar que el cuestionario existe
        const questionnaire = await collections.questionnaires?.findOne<Questionnaire>({ _id: new ObjectId(id) });

        if (!questionnaire) {
            res.status(404).send({
                message: `Questionnaire with id ${id} does not exist`
            });
            return;
        }

        // Buscar usuario por email (puede o no existir)
        let user = await collections.users?.findOne({ email: email });
        let userObjectId: ObjectId;

        if (!user) {
            // Crear usuario temporal para estudiantes anónimos
            console.log(`➕ [QuestionnairesAnonymous] Creando usuario temporal para: ${email}`);
            
            const tempUser = {
                email: email,
                name: email.split('@')[0], // Usar parte del email como nombre temporal
                password: "ANONYMOUS_USER_NO_PASSWORD", // Password temporal para usuarios anónimos
                role: "student",
                askedQuestionnaires: [],
                activities: [],
                groups: [],
                resetToken: "",
                invitationToken: "", // Usuario ya "registrado" vía cuestionario
                notifications: [],
                isTemporary: true, // Marcador para usuarios creados automáticamente
                createdAt: new Date()
            };

            const result = await collections.users?.insertOne(tempUser);
            userObjectId = result!.insertedId;
            console.log(`✅ [QuestionnairesAnonymous] Usuario temporal creado con ID: ${userObjectId}`);
        } else {
            userObjectId = user._id as ObjectId;
            console.log(`👤 [QuestionnairesAnonymous] Usuario existente encontrado: ${user.email}`);
        }

        // Procesar según tipo de cuestionario
        if (questionnaire.questionnaireType === "BELBIN") {
            const roles = getBelbinMainRoles(testValues);
            const belbinResult = Object.keys(roles[0])[0];
            const completionDate = new Date();

            console.log(`🎯 [QuestionnairesAnonymous] Resultado Belbin calculado para ${email}: ${belbinResult}`);

            // Verificar si ya existe una respuesta previa
            const existingResponse = await collections.users?.findOne({
                _id: userObjectId,
                "askedQuestionnaires.questionnaire": new ObjectId(id)
            });

            let updateResult;

            if (existingResponse) {
                // Actualizar respuesta existente
                console.log(`🔄 [QuestionnairesAnonymous] Actualizando respuesta existente para ${email}`);
                updateResult = await collections.users?.updateOne(
                    { 
                        _id: userObjectId, 
                        "askedQuestionnaires.questionnaire": new ObjectId(id) 
                    },
                    {
                        $set: {
                            "askedQuestionnaires.$.result": belbinResult,
                            "askedQuestionnaires.$.completedAt": completionDate
                        }
                    }
                );
            } else {
                // Crear nueva respuesta
                console.log(`➕ [QuestionnairesAnonymous] Creando nueva respuesta para ${email}`);
                updateResult = await collections.users?.updateOne(
                    { _id: userObjectId },
                    {
                        $push: {
                            askedQuestionnaires: {
                                questionnaire: new ObjectId(id),
                                result: belbinResult,
                                completedAt: completionDate
                            }
                        }
                    }
                );
            }

            if (updateResult && (updateResult.modifiedCount > 0 || updateResult.matchedCount > 0)) {
                console.log(`✅ [QuestionnairesAnonymous] Cuestionario guardado exitosamente para ${email}`);
                
                // Actualizar archivos de algoritmo si corresponde
                try {
                    await updateAlgorithmFilesForStudent(userObjectId.toString(), email);
                    console.log(`🔥 [QuestionnairesAnonymous] Archivos de algoritmo actualizados para ${email}`);
                } catch (algorithmError) {
                    console.warn(`⚠️ [QuestionnairesAnonymous] Error actualizando archivos de algoritmo: ${algorithmError}`);
                    // No fallar el submit por esto
                }
                
                res.status(200).send({
                    message: "Cuestionario completado exitosamente", 
                    data: {
                        questionnaire: id,
                        result: belbinResult,
                        allRoles: roles,  // Todos los roles con sus puntuaciones
                        userEmail: email,
                        completedAt: completionDate.toISOString(),
                        isNewUser: !user
                    }
                });
            } else {
                console.error(`❌ [QuestionnairesAnonymous] Error guardando cuestionario para ${email}`);
                res.status(400).send({
                    message: `Failed to save questionnaire with id ${id}`
                });
            }
        } else {
            // Para otros tipos de cuestionarios (implementar según necesidad)
            res.status(400).send({
                message: `Questionnaire type ${questionnaire.questionnaireType} not supported for anonymous submission`
            });
        }

    } catch (error: any) {
        console.error(`❌ [QuestionnairesAnonymous] Error en submit anónimo:`, error.message);
        res.status(500).send({
            message: error.message
        });
    }
});

questionnairesRouter.put("/:id/submit", async (req: Request, res: Response) => {
    const id = req?.params?.id;
    const authUserId = req.session?.authuser as string;

    try {
        const authUserObjectId = new ObjectId(authUserId);
        const testValues = req.body;

        const result = await collections.questionnaires?.findOne<Questionnaire>({ _id: new ObjectId(id) });

        if(!result) {
            res.status(404).send({
                message: `Questionnaire with id ${id} does not exist`
            });
            return;
        }

        if (result?.questionnaireType == "BELBIN") {
            const roles = getBelbinMainRoles(testValues);
            const belbinResult = Object.keys(roles[0])[0];
            const completionDate = new Date();

            console.log(`🎯 [Questionnaires] Resultado Belbin calculado para usuario ${authUserId}: ${belbinResult}`);

            // Verificar si ya existe una respuesta previa para este cuestionario
            const existingResponse = await collections.users?.findOne({
                _id: authUserObjectId,
                "askedQuestionnaires.questionnaire": new ObjectId(id)
            });

            let updateResult;

            if (existingResponse) {
                // Actualizar respuesta existente
                console.log(`🔄 [Questionnaires] Actualizando respuesta existente para usuario ${authUserId}`);
                updateResult = await collections.users?.updateOne(
                    { 
                        _id: authUserObjectId, 
                        "askedQuestionnaires.questionnaire": new ObjectId(id) 
                    },
                    {
                        $set: {
                            "askedQuestionnaires.$.result": belbinResult,
                            "askedQuestionnaires.$.completedAt": completionDate
                        }
                    }
                );
            } else {
                // Crear nueva respuesta
                console.log(`➕ [Questionnaires] Creando nueva respuesta para usuario ${authUserId}`);
                updateResult = await collections.users?.updateOne(
                    { _id: authUserObjectId },
                    {
                        $push: {
                            askedQuestionnaires: {
                                questionnaire: new ObjectId(id),
                                result: belbinResult,
                                completedAt: completionDate
                            }
                        }
                    }
                );
            }

            // Verificar que la actualización fue exitosa
            if (updateResult && (updateResult.modifiedCount > 0 || updateResult.matchedCount > 0)) {
                console.log(`✅ [Questionnaires] Cuestionario guardado exitosamente para usuario ${authUserId}`);
                
                // Obtener información del usuario para logs
                const user = await collections.users?.findOne({ _id: authUserObjectId });
                console.log(`📧 [Questionnaires] Email del usuario: ${user?.email} - Resultado: ${belbinResult}`);
                
                // 🌐 Notificar al estudiante sobre la completitud exitosa via WebSocket
                const studentNotification = {
                    title: "Test Belbin Completado",
                    description: `Has completado exitosamente el test Belbin. Tu perfil es: ${belbinResult}`,
                    type: 'belbin-completed',
                    result: belbinResult,
                    timestamp: completionDate.toISOString()
                };
                
                webSocketService.emitToUser(
                    authUserId, 
                    'belbin-test-completed', 
                    studentNotification
                );
                console.log(`🌐 [WebSocket] Notificación Belbin enviada al estudiante: ${user?.email}`);
                
                // 🔥 NUEVA FUNCIONALIDAD: Actualizar archivos JSON automáticamente
                await updateAlgorithmFilesForStudent(authUserId, user?.email || 'unknown');
                
                res.status(200).send({
                    message: "success", 
                    data: {
                        questionnaire: id,
                        result: belbinResult,
                        allRoles: roles,  // Todos los roles con sus puntuaciones
                        userEmail: user?.email,
                        completedAt: completionDate.toISOString()
                    }
                });
            } else {
                console.error(`❌ [Questionnaires] Error guardando cuestionario para usuario ${authUserId}`);
                res.status(400).send({
                    message: `Failed to save questionnaire with id ${id}`
                });
            }
        }

    } catch (error: any) {
        console.error(error.message);
        res.status(400).send({
            message: error.message
        });
    }
});

questionnairesRouter.delete("/:id", async (req: Request, res: Response) => {
    const id = req?.params?.id;

    try {
        const query = { _id: new ObjectId(id) };
        const result = await collections.questionnaires?.deleteOne(query);

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
 * Endpoint para obtener estadísticas de completitud de cuestionarios por actividad
 * Devuelve el número de estudiantes que han completado cada cuestionario
 * @route GET /questionnaires/activity/:activityId/stats
 * @param {string} activityId - ID de la actividad
 * @returns {Object} Estadísticas de completitud por cuestionario
 */
questionnairesRouter.get("/activity/:activityId/stats", async (req: Request, res: Response) => {
    const activityId = req?.params?.activityId;

    try {
        // Obtener todos los cuestionarios habilitados
        const questionnaires = await collections.questionnaires?.find<Questionnaire>({ enabled: true }).toArray();
        
        if (!questionnaires || questionnaires.length === 0) {
            res.status(200).send([]);
            return;
        }

        // Obtener todos los estudiantes de la actividad
        const activity = await collections.activities?.findOne({ _id: new ObjectId(activityId) });
        
        if (!activity) {
            res.status(404).send({
                message: `Activity with id ${activityId} does not exist`
            });
            return;
        }

        const studentIds = activity.students || [];
        const totalStudents = studentIds.length;

        // Crear el pipeline de agregación para contar las respuestas por cuestionario
        const statsPromises = questionnaires.map(async (questionnaire) => {
            // Contar cuántos estudiantes de esta actividad han respondido este cuestionario
            const completedCount = await collections.users?.countDocuments({
                _id: { $in: studentIds },
                "askedQuestionnaires.questionnaire": questionnaire._id
            });

            return {
                questionnaireId: questionnaire._id,
                questionnaireTitle: questionnaire.title,
                questionnaireType: questionnaire.questionnaireType,
                totalStudents: totalStudents,
                completedCount: completedCount || 0,
                completionPercentage: totalStudents > 0 ? Math.round((completedCount || 0) / totalStudents * 100) : 0
            };
        });

        const stats = await Promise.all(statsPromises);

        res.status(200).send(stats);

    } catch (error: any) {
        console.error(error.message);
        res.status(500).send({
            message: error.message
        });
    }
});

function getBelbinMainRoles(testValues: any): any[] {
    const roleScore = new Array(Object.values(testValues).length + 1).fill(0);

    Object.values(testValues).forEach((value: any) => {
        for (let j = 0; j < Object.values(value).length; j++) {
            const v = Object.values(value)[j];
            roleScore[j] = roleScore[j] + Number(v);
        }
    });

    const roles = [
        { SH: roleScore[0] },
        { CO: roleScore[1] }, // CH
        { PL: roleScore[2] },
        { RI: roleScore[3] },
        { ME: roleScore[4] },
        { IM: roleScore[5] }, // CW
        { TW: roleScore[6] },
        { CF: roleScore[7] },
    ];

    roles.sort((a, b) => {
        return Object.values(b)[0] - Object.values(a)[0];
    });

    return roles;
}

/**
 * Función mejorada para manejar cambios cuando un estudiante completa BELBIN
 * Utiliza el nuevo sistema de escucha de cambios integrado
 * @param userId ID del usuario que completó BELBIN
 * @param userEmail Email del usuario para logs
 */
async function updateAlgorithmFilesForStudent(userId: string, userEmail: string): Promise<void> {
    console.log(`🚀 [QuestionnaireBelbin] Procesando completitud BELBIN para usuario: ${userEmail}`);
    
    try {
        // Obtener todas las actividades donde está este estudiante
        const userActivities = await collections.activities?.find({
            students: new ObjectId(userId)
        }).toArray();

        if (!userActivities || userActivities.length === 0) {
            console.log(`⚠️ [QuestionnaireBelbin] Usuario ${userEmail} no está en ninguna actividad`);
            return;
        }

        console.log(`📋 [QuestionnaireBelbin] Usuario ${userEmail} está en ${userActivities.length} actividad(es)`);

        // Usar el nuevo sistema de escucha de cambios para cada actividad
        const changePromises = userActivities.map(async (activity) => {
            try {
                const activityId = activity._id.toString();
                console.log(`🔔 [QuestionnaireBelbin] Notificando cambio BELBIN para actividad: ${activity.title} (${activityId})`);

                // Usar el sistema de escucha de cambios integrado
                await handleActivityChange(activityId, 'student-belbin', {
                    userId: userId,
                    userEmail: userEmail,
                    completedAt: new Date().toISOString()
                });

                console.log(`✅ [QuestionnaireBelbin] Cambio procesado para actividad: ${activity.title}`);

                // 🌐 Notificar via WebSocket a profesores conectados sobre el cambio
                webSocketService.emitToRole('teacher', 'student-belbin-completed', {
                    activityId: activityId,
                    activityTitle: activity.title,
                    studentEmail: userEmail,
                    studentId: userId,
                    timestamp: new Date().toISOString()
                });

            } catch (activityError: any) {
                console.error(`💥 [QuestionnaireBelbin] Error procesando cambio para actividad ${activity.title}:`, activityError);
            }
        });

        // Esperar a que se procesen todos los cambios
        await Promise.all(changePromises);
        
        console.log(`🎉 [QuestionnaireBelbin] Todos los cambios BELBIN procesados exitosamente para usuario: ${userEmail}`);

    } catch (error: any) {
        console.error(`💥 [QuestionnaireBelbin] Error crítico procesando cambios BELBIN para ${userEmail}:`, error);
    }
}