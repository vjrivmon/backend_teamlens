import express, { Request, Response } from "express";
import { ObjectId } from "mongodb";
import { collections } from "../services/database.service";
import User, { AskedQuestionnaire } from "../models/user";
import Activity from "../models/activity";
import Group from "../models/group";


export const usersRouter = express.Router();


usersRouter.get("/", async (_req: Request, res: Response) => {
    try {
        const users = await collections.users?.find<User[]>({}).toArray();
        res.status(200).send(users);
    } catch (error: any) {
        res.status(500).send(error.message);
    }
});

usersRouter.get("/:id", async (req: Request, res: Response) => {

    const id = req?.params?.id;

    try {
        const query = { _id: new ObjectId(id) };
        const user = await collections.users?.findOne<User>(query);

        if (user) {
            res.status(200).send(user);
        }

    } catch (error) {
        res.status(404).send(`Unable to find matching document with id: ${req.params.id}`);
    }
});

usersRouter.post("/", async (req: Request, res: Response) => {
    try {

        const newUser = req.body as User;

        const result = await collections.users?.insertOne(newUser);

        result
            ? res.status(201).send(`Successfully created a new user with id ${result.insertedId}`)
            : res.status(500).send("Failed to create a new user.");
    } catch (error: any) {
        console.error(error);
        res.status(400).send(error.message);
    }
});

usersRouter.put("/:id", async (req: Request, res: Response) => {
    const id = req?.params?.id;

    try {
        const updatedUser: User = req.body as User;
        const query = { _id: new ObjectId(id) };

        const result = await collections.users?.updateOne(query, { $set: updatedUser });

        result
            ? res.status(200).send(`Successfully updated user with id ${id}`)
            : res.status(304).send(`User with id: ${id} not updated`);
    } catch (error: any) {
        console.error(error.message);
        res.status(400).send(error.message);
    }
});

usersRouter.delete("/:id", async (req: Request, res: Response) => {
    const id = req?.params?.id;

    try {
        const query = { _id: new ObjectId(id) };
        const result = await collections.users?.deleteOne(query);

        if (result && result.deletedCount) {
            res.status(202).send(`Successfully removed user with id ${id}`);
        } else if (!result) {
            res.status(400).send(`Failed to remove user with id ${id}`);
        } else if (!result.deletedCount) {
            res.status(404).send(`User with id ${id} does not exist`);
        }
    } catch (error: any) {
        console.error(error.message);
        res.status(400).send(error.message);
    }
});


usersRouter.get("/:id/activities", async (req: Request, res: Response) => {

    const { id } = req?.params;

    try {
        const user = await collections.users?.findOne<User>({ _id: new ObjectId(id) });
        const activities = await collections.activities?.find<Activity[]>({ $in: { _id: user?.activities } }).toArray();

        if (user) {
            res.status(200).send(activities);
        } else {
            res.status(404).send(`User with id ${id} does not exist`);
        }

    } catch (error: any) {
        console.error(error.message);
        res.status(400).send(error.message);
    }
});

usersRouter.get("/:id/group", async (req: Request, res: Response) => {

    const { id } = req?.params;

    try {
        const user = await collections.users?.findOne<User>({ _id: new ObjectId(id) });
        const groups = await collections.groups?.find<Group[]>({ $in: { _id: user?.groups } }).toArray();

        if (user) {
            res.status(200).send(groups);
        } else {
            res.status(404).send(`User with id ${id} does not exist`);
        }

    } catch (error: any) {
        console.error(error.message);
        res.status(400).send(error.message);
    }
});

//delegar a otro router? src/routes/handle-asked-questionnaires.router.ts
//usersRouter.use("/:id/(asked|send)-questionnaires", handleAskedQuestionnairesRouter);

usersRouter.get("/:id/asked-questionnaires", async (req: Request, res: Response) => {

    const { id } = req?.params;

    try {
        const user = await collections.users?.findOne<User>({ _id: new ObjectId(id) });

        if (user) {
            res.status(200).send(user.askedQuestionnaires as AskedQuestionnaire[]);
        } else {
            res.status(404).send(`User with id ${id} does not exist`);
        }

    } catch (error: any) {
        console.error(error.message);
        res.status(400).send(error.message);
    }
});

usersRouter.post("/:id/send-questionnaire/:questionnaireId", async (req: Request, res: Response) => {

    const { id, questionnaireId } = req?.params;

    const { answers } = req.body;
    console.log(answers);

    // se espera un objecto con las respuestas del cuestionario
    
    // logica de negocio: calcular el resultado del cuestionario y guardarlo en la base de datos askedQuestionnaires: { questionnaireId, result }
    const questionnaireResult = "LIDER"; // mock

    try {

        // si ya ha contestado el cuestionario, se calcula el resultado y se actualiza
        const user = await collections.users?.findOne<User>({ _id: new ObjectId(id), askedQuestionnaires: { $elemMatch: { questionnaire: new ObjectId(questionnaireId) } } });

        let result: any;
        if (user) {
            // update the result
            result = await collections.users?.updateOne({ _id: new ObjectId(id), "askedQuestionnaires.questionnaire": new ObjectId(questionnaireId) }, {
                $set: {
                    "askedQuestionnaires.$.result": questionnaireResult
                }
            });
        } else {
            // add the questionnaire to the user
            result = await collections.users?.updateOne({ _id: new ObjectId(id) }, {
                $push: {
                    askedQuestionnaires: {
                        questionnaire: new ObjectId(questionnaireId),
                        result: questionnaireResult // calculate the result i.e "LIDER" for Belbin questionnaire
                    }
                }
            });
        }

        result
            ? res.status(200).send(`Successfully updated user with id ${id}`)
            : res.status(304).send(`User with id: ${id} not updated`);
    } catch (error: any) {
        console.error(error.message);
        res.status(400).send(error.message);
    }
});