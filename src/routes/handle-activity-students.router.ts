import express, { Request, Response } from "express";
import { ObjectId } from "mongodb";
import Activity from "../models/activity";
import { collections } from "../services/database.service";
import { verifyTeacher } from "../middlewares";
import { webSocketService } from "../services/websocket.service";

import { addUserNotification, createNonRegisteredAccount } from "../functions/user-functions";

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

handleActivityStudentsRouter.post("/", verifyTeacher, async (req: Request, res: Response): Promise<void> => {

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

        //logica de negocio: si el usuario no existe se crea una cuenta temporal con su email, se le envia un correo para que se registre y se le añade a la actividad     
        const temporalUsersEmail: string[] = []
        const emailErrors: string[] = []
        const emailSuccesses: string[] = []

        console.log(`🚀 [ActivityStudents] Iniciando procesamiento paralelo de ${emails.length} emails...`);

        // 🔥 SOLUCIÓN: Procesamiento paralelo con Promise.allSettled para garantizar que todos los emails se procesen
        const emailProcessingPromises = emails.map(async (email: string, index: number) => {
            console.log(`🔄 [ActivityStudents] Procesando email ${index + 1}/${emails.length}: ${email}`);
            
                         // Si el usuario ya existe, marcarlo como éxito
             if (existingUserEmails.includes(email)) {
                 console.log(`✅ [ActivityStudents] Usuario ya existe: ${email}`);
                 const existingUser = users?.find(user => user.email === email);
                 return {
                     email,
                     status: 'existing',
                     userId: existingUser?._id
                 };
             }

            // Usuario no existe - crear cuenta temporal
            temporalUsersEmail.push(email);
            console.log(`➕ [ActivityStudents] Creando cuenta temporal para: ${email}`);
            
            try {
                console.log(`🔧 [ActivityStudents] Llamando a createNonRegisteredAccount para: ${email}`);
                const temporalUserId = await createNonRegisteredAccount(email);
                
                if (temporalUserId) {
                    console.log(`✅ [ActivityStudents] Usuario temporal creado exitosamente: ${email} (ID: ${temporalUserId})`);
                    console.log(`📧 [ActivityStudents] Email de invitación enviado a: ${email}`);
                    return {
                        email,
                        status: 'created',
                        userId: temporalUserId
                    };
                } else {
                    console.error(`❌ [ActivityStudents] No se pudo crear usuario temporal para: ${email}`);
                    return {
                        email,
                        status: 'error',
                        error: 'No se pudo crear cuenta temporal'
                    };
                }
            } catch (error: any) {
                console.error(`❌ [ActivityStudents] Error creando cuenta temporal para ${email}:`, error);
                console.error(`❌ [ActivityStudents] Stack trace:`, error.stack);
                return {
                    email,
                    status: 'error',
                    error: error.message
                };
            }
        });

        // Esperar a que TODAS las operaciones de email se completen
        const emailResults = await Promise.allSettled(emailProcessingPromises);

        // Procesar resultados y construir listas finales
        emailResults.forEach((result, index) => {
            const email = emails[index];
            
            if (result.status === 'fulfilled') {
                const data = result.value;
                
                if (data.status === 'created' || data.status === 'existing') {
                    if (data.userId) {
                        existingUserIds.push(data.userId);
                    }
                    emailSuccesses.push(data.email);
                } else if (data.status === 'error') {
                    emailErrors.push(`${data.email}: ${data.error}`);
                }
            } else {
                // Promise fue rechazada
                console.error(`❌ [ActivityStudents] Promise rechazada para ${email}:`, result.reason);
                emailErrors.push(`${email}: ${result.reason.message || 'Error inesperado'}`);
            }
        });

        console.log(`🏁 [ActivityStudents] Procesamiento paralelo completado`);
        console.log(`   - Promises resueltas: ${emailResults.filter(r => r.status === 'fulfilled').length}/${emailResults.length}`);
        console.log(`   - Promises rechazadas: ${emailResults.filter(r => r.status === 'rejected').length}/${emailResults.length}`);

        // 🛡️ MANEJO DE ERRORES PARCIALES: Verificar si hay demasiados errores para considerar rollback
        const successRate = emailSuccesses.length / emails.length;
        const criticalErrorThreshold = 0.5; // Si menos del 50% tiene éxito, considerar rollback
        
        if (successRate < criticalErrorThreshold && temporalUsersEmail.length > 0) {
            console.warn(`⚠️ [ActivityStudents] Tasa de éxito baja (${Math.round(successRate * 100)}%). Evaluando rollback...`);
            
            // Obtener IDs de usuarios temporales creados exitosamente
            const temporalUserIds: ObjectId[] = [];
            emailResults.forEach((result, index) => {
                if (result.status === 'fulfilled' && result.value.status === 'created' && result.value.userId) {
                    temporalUserIds.push(result.value.userId);
                }
            });

            if (temporalUserIds.length > 0) {
                console.log(`🗑️ [ActivityStudents] Ejecutando rollback para ${temporalUserIds.length} usuarios temporales...`);
                
                try {
                    // Eliminar usuarios temporales creados en esta operación
                    const rollbackResult = await collections.users?.deleteMany({ 
                        _id: { $in: temporalUserIds },
                        isTemporary: true 
                    });
                    
                    console.log(`✅ [ActivityStudents] Rollback ejecutado: ${rollbackResult?.deletedCount} usuarios temporales eliminados`);
                    
                    // Limpiar arrays para reflejar el rollback
                    temporalUsersEmail.length = 0;
                    emailSuccesses.splice(0);
                    existingUserIds.splice(0);
                    
                    // Mantener solo usuarios existentes
                    users?.forEach(user => {
                        if (emails.includes(user.email)) {
                            existingUserIds.push(user._id);
                            emailSuccesses.push(user.email);
                        }
                    });
                    
                    // Añadir todos los emails fallidos a errores
                    temporalUsersEmail.forEach(email => {
                        if (!emailErrors.some(error => error.includes(email))) {
                            emailErrors.push(`${email}: Rollback ejecutado debido a tasa de error alta`);
                        }
                    });
                    
                    console.log(`🔄 [ActivityStudents] Post-rollback: ${emailSuccesses.length} éxitos, ${emailErrors.length} errores`);
                    
                } catch (rollbackError: any) {
                    console.error(`❌ [ActivityStudents] Error durante rollback:`, rollbackError);
                    // No fallar la operación principal por errores de rollback
                }
            }
        }

        // Log del resumen del proceso con más detalle
        console.log(`📊 [ActivityStudents] Resumen del procesamiento de emails:`);
        console.log(`  - Emails procesados: ${emails.length}`);
        console.log(`  - Usuarios existentes: ${existingUserEmails.length}`);
        console.log(`  - Cuentas temporales intentadas: ${temporalUsersEmail.length}`);
        console.log(`  - Invitaciones exitosas: ${emailSuccesses.length}`);
        console.log(`  - Errores de email: ${emailErrors.length}`);
        console.log(`  - IDs finales de usuarios: ${existingUserIds.length}`);

        if (emailErrors.length > 0) {
            console.error(`❌ [ActivityStudents] Errores en el envío de emails:`, emailErrors);
        }

        if (emailSuccesses.length > 0) {
            console.log(`✅ [ActivityStudents] Invitaciones/usuarios procesados exitosamente:`, emailSuccesses);
        }

        console.log(`👥 [ActivityStudents] IDs de usuarios finales a añadir:`, existingUserIds);

        // Verificar que tenemos usuarios para añadir
        if (existingUserIds.length === 0) {
            console.warn(`⚠️ [ActivityStudents] No hay usuarios válidos para añadir a la actividad`);
            res.status(400).send({
                message: "No se pudieron procesar los emails proporcionados",
                errors: emailErrors,
                processedEmails: emails.length,
                successfulEmails: emailSuccesses.length
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
            emailSuccesses: emailSuccesses.length,
            emailErrors: emailErrors.length,
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

        if (result && result.modifiedCount) {
            const responseMessage = {
                message: `Successfully added students to activity with id ${activityId}`,
                studentsAdded: existingUserIds.length,
                existingUsers: existingUserEmails.length,
                temporalUsers: temporalUsersEmail.length,
                emailSuccesses: emailSuccesses.length,
                emailErrors: emailErrors.length,
                details: {
                    existingUsers: existingUserEmails,
                    temporalUsersCreated: emailSuccesses,
                    emailErrors: emailErrors
                }
            };

            console.log(`🎉 [ActivityStudents] Proceso completado exitosamente:`, responseMessage);
            res.status(200).send(responseMessage);
        } else if (!result) {
            console.error(`❌ [ActivityStudents] Error actualizando actividad ${activityId}`);
            res.status(400).send(`Failed added students to activity with id ${activityId}`);
        } else if (result.matchedCount) {
            console.log(`ℹ️  [ActivityStudents] Actividad ${activityId} ya está actualizada`);
            res.status(304).send(`Activity with id ${activityId} is already up to date`);
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

handleActivityStudentsRouter.delete("/:studentId", verifyTeacher, async (_req: Request, _res: Response) => {

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