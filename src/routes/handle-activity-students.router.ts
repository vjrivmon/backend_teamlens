import express, { Request, Response } from "express";
import { ObjectId } from "mongodb";
import Activity from "../models/activity";
import { collections } from "../services/database.service";

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

handleActivityStudentsRouter.post("/", async (req: Request, res: Response) => {

    const { activityId } = req?.params;

    try {

        const { emails } = req.body; // Array of student emails (docs)

        //Check if students exist before adding them to the activity
        const users = await collections.users?.find({ email: { $in: emails } }).toArray();
        const existingUserIds: ObjectId[] = []
        const existingUserEmails: string[] = []

        users?.forEach(user => {
            existingUserIds.push(user._id);
            existingUserEmails.push(user.email);
        });

        //logica de negocio: si el usuario no existe se crea una cuenta temporal con su email, se le envia un correo para que se registre y se le añade a la actividad     
        const temporalUsersEmail: string[] = []
        
        for (let index = 0; index < emails.length; index++) {
            const email = emails[index];
            if (!existingUserEmails.includes(email)) {
                temporalUsersEmail.push(email);
                //crear cuenta temporal
                const temporalUserId = await createNonRegisteredAccount(email);
                if (temporalUserId) {
                    existingUserIds.push(temporalUserId);                    
                    console.log("Users ID added: ", existingUserIds)
                }
            }

        }

        const query = { _id: new ObjectId(activityId) };
        const result = await collections.activities?.updateOne(query, {
            $addToSet: { students: { $each: existingUserIds } }
        });

        await collections.users?.updateMany({ _id: { $in: existingUserIds } }, {
            $addToSet: { activities: new ObjectId(activityId) }
        });
        
        existingUserIds.forEach(async (id) => {
            await addUserNotification(id, {
                title: "Activity",
                description: `You have been added to a new activity`,
                link: `/activities/${activityId}`
            })
        });
        

        if (result && result.modifiedCount) {
            res.status(200).send({
                message: `Successfully added students to activity with id ${activityId}`,
                students: users
            });
        } else if (!result) {
            res.status(400).send(`Failed added students to activity with id ${activityId}`);
        } else if (result.matchedCount) {
            res.status(304).send(`Activity with id ${activityId} is already up to date`);
        } else {
            res.status(404).send(`Activity with id ${activityId} does not exist`);
        }

    } catch (error: any) {
        console.error(error);
        res.status(400).send(error.message);
    }

});

handleActivityStudentsRouter.delete("/:studentId", async (_req: Request, _res: Response) => {

    const { activityId, studentId } = _req?.params;

    try {

        const resultSubstract = await collections.activities?.updateOne({ _id: new ObjectId(activityId) }, { $pull: { students: new ObjectId(studentId) } });

        await collections.users?.updateOne({ _id: new ObjectId(studentId) }, { $pull: { activities: new ObjectId(activityId) } });

        if (resultSubstract && resultSubstract.modifiedCount) {
            _res.status(202).send(`Successfully removed student with id ${studentId}`);
        } else if (!resultSubstract) {
            _res.status(400).send(`Failed to remove student with id ${studentId}`);
        } else if (!resultSubstract.modifiedCount) {
            _res.status(404).send(`Student with id ${studentId} does not exist`);
        }
    } catch (error: any) {
        console.error(error.message);
        _res.status(400).send(error.message);
    }

});