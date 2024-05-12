import express, { Request, Response } from "express";
import { ObjectId } from "mongodb";
import { collections } from "../services/database.service";
//import Activity from "../models/activity"
import Group from "../models/group";
import Activity from "../models/activity";
import { handleGroupStudentsRouter } from "./handle-group-students.router";


export const groupsRouter = express.Router({ mergeParams: true });


groupsRouter.get("/", async (req: Request, res: Response) => {

    const { activityId } = req?.params;

    try {

        const query = { _id: new ObjectId(activityId) };
        const groupsId = (await collections.activities?.findOne<Activity>(query, { projection: { groups: 1 } }))?.groups;

        if (groupsId?.length === 0) {
            res.status(200).send([]);
        }

        const groups = await collections.groups?.find<Group>({ _id: { $in: groupsId! } }).toArray();

        res.status(200).send(groups);

    } catch (error: any) {
        res.status(500).send(error.message);
    }
});

groupsRouter.get("/:id", async (req: Request, res: Response) => {

    const { id } = req?.params;

    try {
        const query = { _id: new ObjectId(id) };
        const group = await collections.groups?.findOne<Group>(query);

        if (group) {
            res.status(200).send(group);
        }

    } catch (error) {
        res.status(404).send(`Unable to find matching document with id: ${req.params.id}`);
    }
});

groupsRouter.post("/", async (req: Request, res: Response) => {

    const { activityId } = req?.params;

    //const session = client.startSession();

    try {

        const newGroup = req.body as Group;

        //session.startTransaction();
        // {session: session} -> MongoError: Transaction numbers are only allowed on a replica set member or mongos.

        const studentsIds = newGroup.students.map(student => new ObjectId(student));
        newGroup.students = studentsIds;

        //Check if students exist before adding them to the group
        const users = await collections.users?.find({ _id: { $in: studentsIds } }, { projection: { _id: 1 } }).toArray();
        const existingUserIds = users?.map(user => new ObjectId(user._id));

        //Check if students belong to the activity before adding them to the group
        const belongUsers = await collections.users?.find({ _id: { $in: existingUserIds}, activities: new ObjectId(activityId)}).toArray();
        const belongUsersIds = belongUsers?.map(user => new ObjectId(user._id));

        if(belongUsersIds?.length !== newGroup.students.length) {
            res.status(400).send("Some students do not belong to the activity");
            return;
        }

        const resultInsert = await collections.groups?.insertOne(newGroup);
        const resultPush = await collections.activities?.updateOne({ _id: new ObjectId(activityId) }, { $push: { groups: resultInsert?.insertedId } });

        await collections.users?.updateMany({ _id: { $in: belongUsersIds } }, {
            $addToSet: { groups: new ObjectId(resultInsert?.insertedId) }
        });
        

        if (!resultPush) {
            collections.groups?.deleteOne({ _id: resultInsert?.insertedId });
            res.status(500).send("Failed to create a new group.");
            return;
        }

        //await session.commitTransaction();

        resultInsert
            ? res.status(201).send(`Successfully created a new group with id ${resultInsert.insertedId}`)
            : res.status(500).send("Failed to create a new group.");

    } catch (error: any) {
        console.error(error);
        //await session.abortTransaction();
        res.status(400).send(error.message);
    }
});

groupsRouter.put("/:id", async (req: Request, res: Response) => {

    const { id } = req?.params;

    try {

        const { students, ...filteredGroup } = req.body as Group;

        const query = { _id: new ObjectId(id) };
        const result = await collections.groups?.updateOne(query, { $set: filteredGroup });

        if (result && result.modifiedCount) {
            res.status(202).send(`Successfully updated group with id ${id}`);
        } else if (!result) {
            res.status(400).send(`Failed to update group with id ${id}`);
        } else if (result.matchedCount) {
            res.status(304).send(`Group with id ${id} is already up to date`);
        } else {
            res.status(404).send(`Group with id ${id} does not exist`);
        }

    } catch (error: any) {
        console.error(error.message);
        res.status(400).send(error.message);
    }
});

groupsRouter.delete("/:id", async (req: Request, res: Response) => {

    const { activityId, id } = req?.params;

    try {

        
        const group = await collections.groups?.findOne<Group>({ _id: new ObjectId(id) }, { projection: { students: 1 } });        
        
        if (!group) {
            res.status(404).send(`Group with id ${id} does not exist`);
            return;
        }
        
        const resultDelete = await collections.groups?.deleteOne({ _id: new ObjectId(id) });
        
        await collections.users?.updateMany({ _id: { $in: group?.students } }, { $pull: { groups: new ObjectId(id) } });
        await collections.activities?.updateOne({ _id: new ObjectId(activityId) }, { $pull: { groups: new ObjectId(id) } });
        

        if (resultDelete && resultDelete.deletedCount) {
            res.status(202).send(`Successfully removed group with id ${id}`);
        } else if (!resultDelete) {
            res.status(400).send(`Failed to remove group with id ${id}`);
        } else if (!resultDelete.deletedCount) {
            res.status(404).send(`Group with id ${id} does not exist`);
        }
    } catch (error: any) {
        console.error(error.message);
        res.status(400).send(error.message);
    }
});


groupsRouter.use("/:groupId/students", handleGroupStudentsRouter);