import express, { Request, Response } from "express";
import { ObjectId } from "mongodb";
import Group from "../models/group";
import { collections } from "../services/database.service";
import { addStudentsToGroup } from "../functions/group-functions";


export const handleGroupStudentsRouter = express.Router({ mergeParams: true });


handleGroupStudentsRouter.get("/", async (req: Request, res: Response) => {

    const { groupId } = req?.params;

    try {

        const query = { _id: new ObjectId(groupId) };
        const group = await collections.groups?.findOne<Group>(query);

        if (!group) {
            res.status(404).send({
                message: `Group not found with id: ${groupId}`
            });
        }

        const students = await collections.users?.find({ _id: { $in: group?.students } }).toArray();

        res.status(200).send(students);

    } catch (error) {
        res.status(404).send({
            message: `Unable to find matching document with id: ${groupId}`
        });
    }
});

handleGroupStudentsRouter.post("/", async (req: Request, res: Response) => {

    const { groupId } = req?.params;

    try {

        const { students } = req.body;
        const usersIds = students?.map((student: string) => new ObjectId(student));

        const result = await addStudentsToGroup(groupId, usersIds);

        if (result.resultPush && result.resultPush.modifiedCount) {
            res.status(200).send({
                members: result.members,
                message: `Successfully added students in group with id ${groupId}`
            });
        } else if (!result.resultPush) {
            res.status(400).send({
                message: `Failed to add students in group with id ${groupId}`
            });
        } else if (result.resultPush.matchedCount) {
            res.status(304).send({
                message: `group with id ${groupId} is already up to date`
            });
        } else {
            res.status(404).send({
                message: `group with id ${groupId} does not exist`
            });
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

        await collections.users?.updateOne({ _id: new ObjectId(studentId) }, { $pull: { groups: new ObjectId(groupId) } });

        if (resultSubstract && resultSubstract.modifiedCount) {
            _res.status(200).send({
                message: `Successfully removed student with id ${studentId}`
            });
        } else if (!resultSubstract) {
            _res.status(400).send({
                message: `Failed to remove student with id ${studentId}`
            });
        } else if (!resultSubstract.modifiedCount) {
            _res.status(404).send({
                message: `Student with id ${studentId} does not exist`
            });
        }
    } catch (error: any) {
        console.error(error.message);
        _res.status(400).send({
            message: error.message
        });
    }

});