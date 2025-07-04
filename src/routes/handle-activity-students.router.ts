import express, { Request, Response } from "express";
import { ObjectId } from "mongodb";
import Activity from "../models/activity";
import { collections } from "../services/database.service";
import { verifyTeacher } from "../middlewares";

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

handleActivityStudentsRouter.post("/", verifyTeacher, async (req: Request, res: Response) => {

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

        for (let index = 0; index < emails.length; index++) {
            const email = emails[index];
            console.log(`🔄 [ActivityStudents] Procesando email ${index + 1}/${emails.length}: ${email}`);
            
            if (!existingUserEmails.includes(email)) {
                temporalUsersEmail.push(email);
                console.log(`➕ [ActivityStudents] Creando cuenta temporal para: ${email}`);
                
                try {
                    //crear cuenta temporal
                    const temporalUserId = await createNonRegisteredAccount(email);
                    
                    if (temporalUserId) {
                        existingUserIds.push(temporalUserId);
                        emailSuccesses.push(email);
                        console.log(`✅ [ActivityStudents] Usuario temporal creado exitosamente: ${email} (ID: ${temporalUserId})`);
                    } else {
                        console.error(`❌ [ActivityStudents] No se pudo crear usuario temporal para: ${email}`);
                        emailErrors.push(`${email}: No se pudo crear cuenta temporal`);
                    }
                } catch (error: any) {
                    console.error(`❌ [ActivityStudents] Error creando cuenta temporal para ${email}:`, error);
                    emailErrors.push(`${email}: ${error.message}`);
                }
            } else {
                console.log(`✅ [ActivityStudents] Usuario ya existe: ${email}`);
            }
        }

        // Log del resumen del proceso
        console.log(`📊 [ActivityStudents] Resumen del procesamiento de emails:`);
        console.log(`  - Emails procesados: ${emails.length}`);
        console.log(`  - Usuarios existentes: ${existingUserEmails.length}`);
        console.log(`  - Cuentas temporales intentadas: ${temporalUsersEmail.length}`);
        console.log(`  - Invitaciones exitosas: ${emailSuccesses.length}`);
        console.log(`  - Errores de email: ${emailErrors.length}`);

        if (emailErrors.length > 0) {
            console.error(`❌ [ActivityStudents] Errores en el envío de emails:`, emailErrors);
        }

        if (emailSuccesses.length > 0) {
            console.log(`✅ [ActivityStudents] Invitaciones enviadas exitosamente a:`, emailSuccesses);
        }

        console.log(`👥 [ActivityStudents] IDs de usuarios finales a añadir:`, existingUserIds);

        const query = { _id: new ObjectId(activityId) };
        const result = await collections.activities?.updateOne(query, {
            $addToSet: { students: { $each: existingUserIds } }
        });

        await collections.users?.updateMany({ _id: { $in: existingUserIds } }, {
            $addToSet: { activities: new ObjectId(activityId) }
        });

        console.log(`🔔 [ActivityStudents] Enviando notificaciones a ${existingUserIds.length} usuarios...`);

        // Añadir notificaciones con manejo de errores mejorado
        const notificationPromises = existingUserIds.map(async (id) => {
            try {
                await addUserNotification(id, {
                    title: "Actividad",
                    description: `Has sido añadido a una nueva actividad`,
                    link: `/activities/${activityId}`
                });
                console.log(`✅ [ActivityStudents] Notificación enviada a usuario: ${id}`);
            } catch (error: any) {
                console.error(`❌ [ActivityStudents] Error enviando notificación a usuario ${id}:`, error);
            }
        });

        await Promise.all(notificationPromises);

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