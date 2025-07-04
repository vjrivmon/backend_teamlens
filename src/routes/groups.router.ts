import express, { Request, Response } from "express";


import { ObjectId } from "mongodb";
import { collections } from "../services/database.service";

import Group from "../models/group";
import Activity from "../models/activity";

import { handleGroupStudentsRouter } from "./handle-group-students.router";

import { createGroup, deleteGroup, getGroupsWithStudents } from "../functions/group-functions";
import { verifyTeacher } from "../middlewares";

import NotFoundError from "../functions/exceptions/NotFoundError";


export const groupsRouter = express.Router({ mergeParams: true });


groupsRouter.get("/", async (req: Request, res: Response) => {

    const { activityId } = req?.params;

    try {

        const query = { _id: new ObjectId(activityId) };
        const groupsId = (await collections.activities?.findOne<Activity>(query, { projection: { groups: 1 } }))?.groups;

        const groups = groupsId ? await getGroupsWithStudents(groupsId) : []

        res.status(200).send(groups);

    } catch (error: any) {
        res.status(500).send({
            message: error.message
        });
    }
});

groupsRouter.get("/:id", async (req: Request, res: Response) => {

    const { id } = req?.params;

    try {

        const group = await getGroupsWithStudents([new ObjectId(id)]) ?? [];

        if (group?.length > 0) {
            res.status(200).send(group[0]);
        }

    } catch (error) {
        res.status(404).send({
            message: `Unable to find matching document with id: ${id}`
        });
    }
});

groupsRouter.post("/", verifyTeacher, async (req: Request, res: Response) => {

    const { activityId } = req?.params;

    //const session = client.startSession();

    try {

        const newGroup = req.body as Group;

        const createdGroup = await createGroup(activityId, newGroup);

        if (createdGroup) {
            res.status(201).send({
                message: `Successfully created a new group with id ${createdGroup._id}`,
                group: createdGroup
            });
        } else {
            res.status(500).send({
                message: `Failed to create a new group`
            });
        }

    } catch (error: any) {

        console.error(error.message);

        if (error instanceof NotFoundError) {
            res.status(404).send({
                message: error.message
            });
        } else {
            res.status(500).send({
                message: error.message
            });
        }
    }
});

groupsRouter.put("/:id", verifyTeacher, async (req: Request, res: Response) => {

    const { id } = req?.params;

    try {

        const { students, ...filteredGroup } = req.body as Group;

        const query = { _id: new ObjectId(id) };
        const result = await collections.groups?.updateOne(query, { $set: filteredGroup });

        if (result && result.modifiedCount) {
            res.status(200).send(`Successfully updated group with id ${id}`);
        } else if (!result) {
            res.status(400).send(`Failed to update group with id ${id}`);
        } else if (result.matchedCount) {
            res.status(304).send({
                message: `Group with id ${id} is already up to date`
            });
        } else {
            res.status(404).send({
                message: `Group with id ${id} does not exist`
            });
        }

    } catch (error: any) {
        console.error(error.message);
        res.status(400).send({
            message: error.message
        });
    }
});

groupsRouter.delete("/:id", verifyTeacher, async (req: Request, res: Response) => {

    const { id } = req?.params;

    try {

        const deleted = await deleteGroup(id);

        if (deleted) {
            res.status(202).send({
                message: `Successfully removed group with id ${id}`
            });
        } else {
            res.status(400).send({
                message: `Failed to remove group with id ${id}`
            });
        }

    } catch (error: any) {

        console.error(error.message);

        if (error instanceof NotFoundError) {
            res.status(404).send({
                message: error.message
            });
        } else {
            res.status(500).send({
                message: error.message
            });
        }
    }
});


groupsRouter.use("/:groupId/students", handleGroupStudentsRouter);