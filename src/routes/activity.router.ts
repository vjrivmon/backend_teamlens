import express, { Request, Response } from "express";
import { ObjectId } from "mongodb";
import { collections } from "../services/database.service";
import Activity from "../models/activity";

import { groupsRouter } from "./groups.router";
import { handleActivityStudentsRouter } from "./handle-activity-students.router";


export const activitiesRouter = express.Router();

activitiesRouter.get("/", async (_req: Request, res: Response) => {
    try {
        const activities = await collections.activities?.find<Activity[]>({}).toArray();
        res.status(200).send(activities);
    } catch (error: any) {
        res.status(500).send(error.message);
    }
});

activitiesRouter.get("/:id", async (req: Request, res: Response) => {

    const id = req?.params?.id;

    try {
        const query = { _id: new ObjectId(id) };
        const activity = await collections.activities?.findOne<Activity>(query);

        !activity
            ? res.status(404).send(`Unable to find matching document with id: ${req.params.id}`)
            : res.status(200).send(activity);

    } catch (error) {
        res.status(404).send(`Unable to find matching document with id: ${req.params.id}`);
    }
});

activitiesRouter.post("/", async (req: Request, res: Response) => {

    try {

        const { students, groups, ...filteredActivity } = req.body as Activity;

        const result = await collections.activities?.insertOne(filteredActivity);

        result
            ? res.status(201).send(`Successfully created a new activity with id ${result.insertedId}`)
            : res.status(500).send("Failed to create a new activity.");

    } catch (error: any) {
        console.error(error);
        res.status(400).send(error.message);
    }
});

activitiesRouter.put("/:id", async (req: Request, res: Response) => {

    const id = req?.params?.id;

    try {

        const { students, groups, ...filteredActivity } = req.body as Activity;

        const query = { _id: new ObjectId(id) };
        const result = await collections.activities?.updateOne(query, { $set: filteredActivity });

        if (result && result.modifiedCount) {
            res.status(202).send(`Successfully updated activity with id ${id}`);
        } else if (!result) {
            res.status(400).send(`Failed to update activity with id ${id}`);
        } else if (result.matchedCount) {
            res.status(304).send(`Activity with id ${id} is already up to date`);
        } else {
            res.status(404).send(`Activity with id ${id} does not exist`);
        }

    } catch (error: any) {
        console.error(error.message);
        res.status(400).send(error.message);
    }
});

activitiesRouter.delete("/:id", async (req: Request, res: Response) => {
    const id = req?.params?.id;

    try {
        const query = { _id: new ObjectId(id) };
        const result = await collections.activities?.deleteOne(query);

        if (result && result.deletedCount) {
            res.status(202).send(`Successfully removed activity with id ${id}`);
        } else if (!result) {
            res.status(400).send(`Failed to remove activity with id ${id}`);
        } else if (!result.deletedCount) {
            res.status(404).send(`Activity with id ${id} does not exist`);
        }
    } catch (error: any) {
        console.error(error.message);
        res.status(400).send(error.message);
    }
});


activitiesRouter.use("/:activityId/groups", groupsRouter);

activitiesRouter.use("/:activityId/students", handleActivityStudentsRouter);