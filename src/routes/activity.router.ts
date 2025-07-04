import express, { Request, Response } from "express";

import { ObjectId } from "mongodb";
import { collections } from "../services/database.service";
import Activity from "../models/activity";

import { groupsRouter } from "./groups.router";
import { handleActivityStudentsRouter } from "./handle-activity-students.router";
import { createGroup, deleteGroup } from "../functions/group-functions";
import { verifyTeacher } from "../middlewares";

import { Worker } from 'worker_threads';
import path from 'path';
import Group from "../models/group";
import { addUserNotification } from "../functions/user-functions";
import emailService from "../services/email.service";

export const activitiesRouter = express.Router();

activitiesRouter.get("/", async (_req: Request, res: Response) => {
    try {
        const activities = await collections.activities?.find<Activity[]>({}).toArray();
        res.status(200).send(activities);
    } catch (error: any) {
        res.status(500).send({
            message: error.message
        });
    }
});

activitiesRouter.get("/:id", async (req: Request, res: Response) => {

    const id = req?.params?.id;

    try {
        const query = { _id: new ObjectId(id) };
        const activity = await collections.activities?.findOne<Activity>(query);

        !activity
            ? res.status(404).send({
                message: `Unable to find matching document with id: ${id}`
            })
            : res.status(200).send(activity);

    } catch (error) {
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


// Tarea y cola para gestionar las peticiones al algoritmo

const MAX_WORKERS = 10;
let activeWorkers = 0;
const taskQueue: any[] = [];

activitiesRouter.post("/:id/create-algorithm", verifyTeacher, async (req: Request, res: Response) => {

    const id = req?.params?.id;

    console.log(req.body);

    const data = {
        activityId: id,
        algorithmData: { ...req.body }
    };

    console.log(data);

    try {

        if (activeWorkers < MAX_WORKERS) {
            startAlgorithmWorker(data);
        } else {
            taskQueue.push(data);
        }

        await collections.activities?.updateOne({ _id: new ObjectId(id) }, {
            $set: { algorithmStatus: 'running' }
        });

        res.status(200).send({
            message: 'Tarea iniciada en segundo plano'
        });

    } catch (error: any) {
        res.status(500).send({
            message: error.message
        });
    }

});

const startAlgorithmWorker = (data: any) => {

    activeWorkers++;

    const worker = new Worker(path.join(__dirname, '../scripts/algorithm-req-worker.js'), { workerData: data });

    worker.on('message', async (algorithmResult) => {


        const { activityId } = data;
        console.log(`Mensaje del trabajador: ${algorithmResult}`, activityId);

        try {

            await collections.activities?.updateOne({ _id: new ObjectId(activityId as string) }, {
                $set: { algorithmStatus: 'done' }
            });
    
            const teams = JSON.parse(algorithmResult);
    
            console.log(teams);
            
            teams.forEach(async (team: any, index: any) => {
                try {
                    await createGroup(activityId, {
                        name: 'Grupo ' + (index + 1),
                        students: team
                    } as Group);
                } catch (error: any) {
                    console.error(error);
                }                
            });
    
            const activity = await collections.activities?.findOne({ _id: new ObjectId(activityId as string) });
    
            await addUserNotification(new ObjectId(activity?.teacher), {
                title: 'Algoritmo de agrupación finalizado',
                description: `El algoritmo de agrupación ha finalizado para la actividad ${activity?.title}`,
                link: `/activities/${activityId}`
            });

            console.log(algorithmResult);
            
        } catch (error: any) {
            console.log(error);
            throw new Error(error);
        }        

    });

    worker.on('exit', (code) => {

        activeWorkers--;

        if (taskQueue.length > 0) {
            const nextTask = taskQueue.shift();
            startAlgorithmWorker(nextTask);
        }
        if (code !== 0) {
            console.error(`El trabajador se detuvo con el código de salida ${code}`);
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

        studentsWhoDidNotAnswer?.forEach(async (student) => {
            // se le envia un correo para que se registre
            let mailDetails = {
                to: student.email,
                subject: 'Cuestionario pendiente',
                text: `Tu profesor necesita que realices el siguiente cuestionario: http://localhost:4200/questionnaire/${questionnaireId}`
            };

            await emailService.sendEmail(mailDetails);
        });

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