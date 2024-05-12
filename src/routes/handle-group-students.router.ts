import express, { Request, Response } from "express";
import { ObjectId } from "mongodb";
import Group from "../models/group";
import { collections } from "../services/database.service";


export const handleGroupStudentsRouter = express.Router({ mergeParams: true });


handleGroupStudentsRouter.get("/", async (req: Request, res: Response) => {

    const { groupId } = req?.params;

    try {
        const query = { _id: new ObjectId(groupId) };
        const group = await collections.groups?.findOne<Group>(query);

        if (group) {
            res.status(200).send(group.students);
        }

    } catch (error) {
        res.status(404).send(`Unable to find matching document with id: ${req.params.id}`);
    }
});

handleGroupStudentsRouter.post("/", async (req: Request, res: Response) => {

    const { groupId, activityId } = req?.params;

    try {

        const { students } = req.body; // Array of IDs (docs)

        const usersIds = students?.map((student: string) => new ObjectId(student));

        //Check if students exist before adding them to the group
        const users = await collections.users?.find({ _id: { $in: usersIds } }, { projection: { _id: 1 } }).toArray();
        const existingUserIds = users?.map(user => new ObjectId(user._id));
        
        //Check if students belong to the activity before adding them to the group
        const belongUsers = await collections.users?.find({ _id: { $in: existingUserIds}, activities: new ObjectId(activityId)}).toArray();
        const belongUsersIds = belongUsers?.map(user => new ObjectId(user._id));
        
        const query = { _id: new ObjectId(groupId) };
        const result = await collections.groups?.updateOne(query, {
            $addToSet: { students: { $each: belongUsersIds } }
        });

        await collections.users?.updateMany({ _id: { $in: belongUsersIds } }, {
            $addToSet: { activities: new ObjectId(groupId) }
        });

        if (result && result.modifiedCount) {
            res.status(202).send(`Successfully added students in group with id ${groupId}`);
        } else if (!result) {
            res.status(400).send(`Failed to add students in group with id ${groupId}`);
        } else if (result.matchedCount) {
            res.status(304).send(`group with id ${groupId} is already up to date`);
        } else {
            res.status(404).send(`group with id ${groupId} does not exist`);
        }

    } catch (error: any) {
        console.error(error);
        res.status(400).send(error.message);
    }

});

handleGroupStudentsRouter.delete("/:studentId", async (_req: Request, _res: Response) => {

    const { groupId, studentId } = _req?.params;

    try {

        const resultSubstract = await collections.groups?.updateOne({ _id: new ObjectId(groupId) }, { $pull: { students: new ObjectId(studentId) } });

        await collections.users?.updateOne({ _id: new ObjectId(studentId) }, { $pull: { activities: new ObjectId(groupId) } });

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