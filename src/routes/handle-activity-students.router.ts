import express, { Request, Response } from "express";
import { ObjectId } from "mongodb";
import Activity from "../models/activity";
import { collections } from "../services/database.service";


export const handleActivityStudentsRouter = express.Router({ mergeParams: true });


handleActivityStudentsRouter.get("/", async (req: Request, res: Response) => {

    const { activityId } = req?.params;

    try {
        const query = { _id: new ObjectId(activityId) };
        const activity = await collections.activities?.findOne<Activity>(query);

        if (activity) {
            res.status(200).send(activity.students);
        }

    } catch (error) {
        res.status(404).send(`Unable to find matching document with id: ${req.params.id}`);
    }
});

handleActivityStudentsRouter.post("/", async (req: Request, res: Response) => {

    const { activityId } = req?.params;

    try {

        const { students } = req.body; // Array of student emails (docs)

        //Check if students exist before adding them to the activity
        const users = await collections.users?.find({ email: { $in: students } }, { projection: { _id: 1 } }).toArray();
        const existingUserIds = users?.map(user => user._id);

        //logica de negocio: si el usuario no existe se crea una cuenta temporal con su email, se le añade y se le envia un correo para que se registre

        const query = { _id: new ObjectId(activityId) };
        const result = await collections.activities?.updateOne(query, {
            $addToSet: { students: { $each: existingUserIds } }
        });

        await collections.users?.updateMany({ _id: { $in: existingUserIds } }, {
            $addToSet: { activities: new ObjectId(activityId) }
        });

        if (result && result.modifiedCount) {
            res.status(202).send(`Successfully updated activity with id ${activityId}`);
        } else if (!result) {
            res.status(400).send(`Failed to update activity with id ${activityId}`);
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