import express, { Request, Response } from "express";

import { ObjectId } from "mongodb";
import { collections } from "../services/database.service";
import Activity from "../models/activity";

import { groupsRouter } from "./groups.router";
import { handleActivityStudentsRouter } from "./handle-activity-students.router";
import { createGroup, deleteGroup } from "../functions/group-functions";

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

activitiesRouter.put("/:id", async (req: Request, res: Response) => {

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

activitiesRouter.delete("/:id", async (req: Request, res: Response) => {

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

activitiesRouter.post("/:id/create-algorithm", async (req: Request, res: Response) => {

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

        // Buscar estudiantes que no han respondido el cuestionario
        const studentsWhoDidNotAnswer = await collections.users?.find({
            _id: { $in: activity.students },  // Filtrar estudiantes asignados
            askedQuestionnaires: { 
              $not: {
                $elemMatch: {
                  questionnaire: new ObjectId(questionnaireId)  // Filtrar estudiantes que no han respondido el cuestionario
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


activitiesRouter.use("/:activityId/groups", groupsRouter);

activitiesRouter.use("/:activityId/students", handleActivityStudentsRouter);