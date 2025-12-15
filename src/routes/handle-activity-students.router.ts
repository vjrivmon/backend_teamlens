import express, { Request, Response } from "express";
import { ObjectId } from "mongodb";
import Activity from "../models/activity";
import { collections } from "../services/database.service";
import { verifyTeacher, verifyToken } from "../middlewares";
import { webSocketService } from "../services/websocket.service";
import { emailQueueService, StudentInvitationJob } from "../services/email-queue.service";

import { addUserNotification, createNonRegisteredAccount, CreateNonRegisteredAccountResult } from "../functions/user-functions";

export const handleActivityStudentsRouter = express.Router({ mergeParams: true });


handleActivityStudentsRouter.get("/", async (req: Request, res: Response) => {

    const { activityId } = req?.params;

    try {
        const query = { _id: new ObjectId(activityId) };
        const activity = await collections.activities?.findOne<Activity>(query);

        if (!activity) {
            res.status(404).send(`Activity not found with id: ${activityId}`);
            return;
        }

        const students = activity?.students
            ? await collections.users?.find({ _id: { $in: activity?.students } }).toArray()
            : []

        res.status(200).send(students);

    } catch (error) {
        res.status(404).send(`Unable to find matching document with id: ${activityId}`);
    }
});

handleActivityStudentsRouter.post("/", verifyToken, verifyTeacher, async (req: Request, res: Response): Promise<void> => {

    const { activityId } = req?.params;
    console.log(`📋 [ActivityStudents] Iniciando proceso de adición de estudiantes a actividad: ${activityId}`);

    try {

        const { emails } = req.body; // Array of student emails (docs)
        console.log(`📧 [ActivityStudents] Emails a procesar:`, emails);

        //Check if students exist before adding them to the activity
        const users = await collections.users?.find({ email: { $in: emails } }).toArray();
        const existingUserIds: ObjectId[] = []
        const existingUserEmails: string[] = []

        users?.forEach(user => {
            existingUserIds.push(user._id);
            existingUserEmails.push(user.email);
        });

        console.log(`👥 [ActivityStudents] Usuarios existentes encontrados: ${existingUserEmails.length}`);
        console.log(`📧 [ActivityStudents] Emails existentes:`, existingUserEmails);

        // 🚀 NUEVA LÓGICA: Crear usuarios SIN enviar emails, luego encolar emails
        const temporalUsersEmail: string[] = [];
        const emailJobsToQueue: StudentInvitationJob[] = [];
        const creationErrors: Array<{ email: string; error: string }> = [];
        const teacherId = req.session?.authuser as string;

        console.log(`🚀 [ActivityStudents] Iniciando creación de usuarios (emails se encolarán después)...`);

        // Procesar cada email secuencialmente para crear usuarios
        for (const email of emails) {
            // Si el usuario ya existe, saltar
            if (existingUserEmails.includes(email)) {
                console.log(`✅ [ActivityStudents] Usuario ya existe: ${email}`);
                continue;
            }

            try {
                console.log(`➕ [ActivityStudents] Creando cuenta temporal para: ${email}`);

                // Crear usuario SIN enviar email (skipEmail: true)
                const result = await createNonRegisteredAccount(email, { skipEmail: true });

                if (result) {
                    existingUserIds.push(result.userId);
                    temporalUsersEmail.push(email);

                    // Preparar job para la cola de emails
                    emailJobsToQueue.push({
                        email,
                        invitationToken: result.invitationToken
                    });

                    console.log(`✅ [ActivityStudents] Usuario creado: ${email} (email pendiente de encolar)`);
                } else {
                    creationErrors.push({
                        email,
                        error: 'No se pudo crear cuenta temporal'
                    });
                }
            } catch (error: any) {
                console.error(`❌ [ActivityStudents] Error creando ${email}:`, error.message);
                creationErrors.push({
                    email,
                    error: error.message
                });
            }
        }

        // Log del resumen del proceso
        console.log(`📊 [ActivityStudents] Resumen de creación de usuarios:`);
        console.log(`  - Emails procesados: ${emails.length}`);
        console.log(`  - Usuarios existentes: ${existingUserEmails.length}`);
        console.log(`  - Usuarios temporales creados: ${temporalUsersEmail.length}`);
        console.log(`  - Emails a encolar: ${emailJobsToQueue.length}`);
        console.log(`  - Errores de creación: ${creationErrors.length}`);
        console.log(`  - IDs totales de usuarios: ${existingUserIds.length}`);

        if (creationErrors.length > 0) {
            console.error(`❌ [ActivityStudents] Errores en creación:`, creationErrors);
        }

        console.log(`👥 [ActivityStudents] IDs de usuarios a añadir:`, existingUserIds);

        // Verificar que tenemos usuarios para añadir
        if (existingUserIds.length === 0) {
            console.warn(`⚠️ [ActivityStudents] No hay usuarios válidos para añadir a la actividad`);
            res.status(400).send({
                message: "No se pudieron procesar los emails proporcionados",
                errors: creationErrors,
                processedEmails: emails.length,
                successfulEmails: temporalUsersEmail.length
            });
            return;
        }

        // Añadir estudiantes a la actividad
        console.log(`🔗 [ActivityStudents] Añadiendo ${existingUserIds.length} usuarios a la actividad ${activityId}...`);
        const query = { _id: new ObjectId(activityId) };
        const result = await collections.activities?.updateOne(query, {
            $addToSet: { students: { $each: existingUserIds } }
        });

        if (!result || result.matchedCount === 0) {
            console.error(`❌ [ActivityStudents] No se pudo encontrar la actividad ${activityId}`);
            res.status(404).send({
                message: `Activity with id ${activityId} not found`
            });
            return;
        }

        console.log(`📝 [ActivityStudents] Resultado de actualización de actividad:`, {
            matchedCount: result.matchedCount,
            modifiedCount: result.modifiedCount,
            upsertedCount: result.upsertedCount
        });

        // Añadir actividad a los usuarios
        console.log(`👤 [ActivityStudents] Añadiendo actividad ${activityId} a ${existingUserIds.length} usuarios...`);
        await collections.users?.updateMany({ _id: { $in: existingUserIds } }, {
            $addToSet: { activities: new ObjectId(activityId) }
        });

        console.log(`🔔 [ActivityStudents] Enviando notificaciones a ${existingUserIds.length} usuarios...`);

        // Añadir notificaciones con manejo de errores mejorado
        const notificationPromises = existingUserIds.map(async (id) => {
            try {
                const notificationData = {
                    title: "Actividad",
                    description: `Has sido añadido a una nueva actividad`,
                    link: `/activities/${activityId}`
                };

                await addUserNotification(id, notificationData);
                
                // 🌐 WebSocket: Enviar notificación en tiempo real al estudiante
                webSocketService.emitToUser(id.toString(), 'new-activity-assignment', {
                    activityId: activityId,
                    title: notificationData.title,
                    description: notificationData.description,
                    link: notificationData.link,
                    timestamp: new Date().toISOString()
                });
                
                console.log(`✅ [ActivityStudents] Notificación enviada a usuario: ${id}`);
            } catch (error: any) {
                console.error(`❌ [ActivityStudents] Error enviando notificación a usuario ${id}:`, error);
            }
        });

        await Promise.all(notificationPromises);

        // 🌐 WebSocket: Notificar al profesor sobre el éxito de la operación
        const teacherNotification = {
            title: `Estudiantes añadidos exitosamente`,
            description: `Se han añadido ${existingUserIds.length} estudiantes a la actividad`,
            activityId: activityId,
            studentsAdded: existingUserIds.length,
            emailsQueued: emailJobsToQueue.length,
            creationErrors: creationErrors.length,
            timestamp: new Date().toISOString()
        };

        webSocketService.emitToUser(req.session?.authuser as string, 'activity-students-added', teacherNotification);

        // 🔥 NUEVA FUNCIONALIDAD: Sistema de escucha de cambios para estudiantes añadidos
        if (existingUserIds.length > 0) {
            console.log(`🔔 [ActivityStudents] Activando sistema de escucha de cambios para ${existingUserIds.length} nuevos estudiantes...`);
            
            const { handleActivityChange } = await import("../functions/algorithm-functions");
            
            await handleActivityChange(activityId, 'student-added', {
                addedStudents: existingUserIds.map(id => id.toString()),
                addedBy: req.session?.authuser,
                addedAt: new Date().toISOString()
            });

            // 🚀 CRÍTICO: Verificar automáticamente el estado de Belbin después de añadir estudiantes
            try {
                console.log(`🔄 [ActivityStudents] Verificando estado Belbin automáticamente...`);
                
                // Obtener la actividad actualizada
                const updatedActivity = await collections.activities?.findOne({ _id: new ObjectId(activityId) });
                if (!updatedActivity) {
                    console.log(`❌ [ActivityStudents] No se pudo obtener la actividad actualizada`);
                    return;
                }

                const totalStudents = updatedActivity.students?.length || 0;
                let studentsWithBelbin = 0;

                // Verificar completitud de Belbin estudiante por estudiante
                for (const studentId of updatedActivity.students || []) {
                    const student = await collections.users?.findOne({ _id: studentId });
                    if (student) {
                        const hasBelbin = student.askedQuestionnaires?.some(
                            q => q.questionnaire.toString() === process.env.BELBIN_QUESTIONNAIRE_ID && q.result
                        );
                        if (hasBelbin) {
                            studentsWithBelbin++;
                        }
                    }
                }

                const allCompleted = studentsWithBelbin === totalStudents;
                const completionPercentage = totalStudents > 0 ? Math.round((studentsWithBelbin / totalStudents) * 100) : 0;

                console.log(`📊 [ActivityStudents] Belbin: ${studentsWithBelbin}/${totalStudents} (${completionPercentage}%)`);

                // Determinar nuevo estado del algoritmo
                let newAlgorithmStatus = updatedActivity.algorithmStatus || 'not-configured';
                const hasConfig = updatedActivity.algorithmConfig?.isConfigured;

                if (hasConfig && allCompleted) {
                    newAlgorithmStatus = 'ready';
                } else if (hasConfig && !allCompleted) {
                    newAlgorithmStatus = 'configured';
                }

                // Actualizar actividad si hay cambios
                if (updatedActivity.algorithmStatus !== newAlgorithmStatus) {
                    await collections.activities?.updateOne(
                        { _id: new ObjectId(activityId) },
                        { 
                            $set: { 
                                algorithmStatus: newAlgorithmStatus,
                                updatedAt: new Date()
                            }
                        }
                    );
                    console.log(`🔄 [ActivityStudents] Estado actualizado: ${updatedActivity.algorithmStatus} → ${newAlgorithmStatus}`);
                }

                // 🌐 WebSocket: Emitir evento de actualización de estado de Belbin
                webSocketService.emitToUser(req.session?.authuser as string, 'activity-belbin-status-updated', {
                    activityId: activityId,
                    title: updatedActivity.title,
                    totalStudents,
                    completedBelbin: studentsWithBelbin,
                    completionPercentage,
                    allCompleted,
                    algorithmStatus: newAlgorithmStatus,
                    timestamp: new Date().toISOString()
                });

                if (allCompleted) {
                    webSocketService.emitToUser(req.session?.authuser as string, 'activity-belbin-completed', {
                        activityId: activityId,
                        message: 'Todos los estudiantes han completado el test Belbin',
                        completionPercentage: 100,
                        algorithmStatus: newAlgorithmStatus,
                        timestamp: new Date().toISOString()
                    });
                }

            } catch (refreshError: any) {
                console.error(`❌ [ActivityStudents] Error verificando estado Belbin:`, refreshError.message);
                // No fallar la operación principal por esto
            }
        }

        // 📬 ENCOLAR EMAILS: Después de todas las operaciones exitosas
        let batchId: string | null = null;
        if (emailJobsToQueue.length > 0 && result && result.modifiedCount) {
            console.log(`📬 [ActivityStudents] Encolando ${emailJobsToQueue.length} emails de invitación...`);

            batchId = emailQueueService.enqueueStudentInvitations(
                emailJobsToQueue,
                {
                    activityId,
                    teacherId,
                    priority: 'normal'
                }
            );

            console.log(`✅ [ActivityStudents] Emails encolados con batchId: ${batchId}`);
        }

        if (result && result.modifiedCount) {
            const responseMessage = {
                message: `Estudiantes agregados exitosamente${emailJobsToQueue.length > 0 ? '. Emails de invitación en proceso de envío.' : '.'}`,
                studentsAdded: existingUserIds.length,
                existingUsers: existingUserEmails.length,
                temporalUsers: temporalUsersEmail.length,
                emailsQueued: emailJobsToQueue.length,
                batchId: batchId,
                creationErrors: creationErrors.length,
                details: {
                    existingUsers: existingUserEmails,
                    temporalUsersCreated: temporalUsersEmail,
                    creationErrors: creationErrors
                }
            };

            console.log(`🎉 [ActivityStudents] Proceso completado exitosamente:`, responseMessage);
            res.status(200).send(responseMessage);
        } else if (!result) {
            console.error(`❌ [ActivityStudents] Error actualizando actividad ${activityId}`);
            res.status(400).send(`Failed added students to activity with id ${activityId}`);
        } else if (result.matchedCount) {
            // Si no se modificó pero se encontró, los estudiantes ya estaban agregados
            // Aun así, encolar emails si hay nuevos usuarios
            if (emailJobsToQueue.length > 0) {
                console.log(`📬 [ActivityStudents] Encolando ${emailJobsToQueue.length} emails (actividad ya actualizada)...`);
                batchId = emailQueueService.enqueueStudentInvitations(
                    emailJobsToQueue,
                    { activityId, teacherId, priority: 'normal' }
                );
            }

            const responseMessage = {
                message: `Actividad ya actualizada${emailJobsToQueue.length > 0 ? '. Emails de invitación en proceso.' : '.'}`,
                studentsAdded: existingUserIds.length,
                emailsQueued: emailJobsToQueue.length,
                batchId: batchId
            };
            console.log(`ℹ️  [ActivityStudents] Actividad ${activityId} ya está actualizada`);
            res.status(200).send(responseMessage);
        } else {
            console.error(`❌ [ActivityStudents] Actividad ${activityId} no encontrada`);
            res.status(404).send(`Activity with id ${activityId} does not exist`);
        }

    } catch (error: any) {
        console.error(`💥 [ActivityStudents] Error crítico en adición de estudiantes:`, error);
        console.error(`💥 [ActivityStudents] Stack trace:`, error.stack);
        res.status(400).send({
            error: error.message,
            details: `Error procesando estudiantes para actividad ${activityId}`
        });
    }

});

handleActivityStudentsRouter.delete("/:studentId", verifyToken, verifyTeacher, async (_req: Request, _res: Response) => {

    const { activityId, studentId } = _req?.params;

    try {

         // Eliminar al estudiante de la lista general de estudiantes de la actividad
         const resultSubstract = await collections.activities?.updateOne(
            { _id: new ObjectId(activityId) },
            { $pull: { students: new ObjectId(studentId) } }
        );

        // Eliminar al estudiante de cualquier grupo relacionado con la actividad
        const resultGroupUpdate = await collections.groups?.updateMany(
            { activity: new ObjectId(activityId) },
            { $pull: { students: new ObjectId(studentId) } }
        );

        // También eliminamos la actividad de la lista de actividades del estudiante
        const resultUserUpdate = await collections.users?.updateOne(
            { _id: new ObjectId(studentId) },
            { $pull: { activities: new ObjectId(activityId) } }
        );

        // Verificar si se modificaron los documentos de la actividad, grupos y estudiante
        if (resultSubstract?.modifiedCount || resultGroupUpdate?.modifiedCount || resultUserUpdate?.modifiedCount) {
            _res.status(202).send({
                message: `Successfully removed student with id ${studentId} from activity, groups, and user's activities`
            });
        } else if (!resultSubstract?.modifiedCount) {
            _res.status(404).send({
                message: `Student with id ${studentId} does not exist in activity or groups`
            });
        } else {
            _res.status(400).send({
                message: `Failed to remove student with id ${studentId}`
            });
        }

    } catch (error: any) {
        console.error(error.message);
        _res.status(400).send(error.message);
    }

});