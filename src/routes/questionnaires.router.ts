import express, { Request, Response } from "express";
import { ObjectId } from "mongodb";
import { collections } from "../services/database.service";
import Questionnaire from "../models/questionnaire";

export const questionnairesRouter = express.Router();

questionnairesRouter.get("/", async (_req: Request, res: Response) => {
    try {
        const questionnaires = await collections.questionnaires?.find<Questionnaire[]>({}).toArray();
        res.status(200).send(questionnaires);
    } catch (error: any) {
        res.status(500).send(error.message);
    }
});

questionnairesRouter.get("/:id", async (req: Request, res: Response) => {

    const id = req?.params?.id;
    
    try {
        const query = { _id: new ObjectId(id) };
        const questionnaire = await collections.questionnaires?.findOne<Questionnaire>(query);

        if (questionnaire) {
            res.status(200).send(questionnaire);
        }

    } catch (error) {
        res.status(404).send(`Unable to find matching document with id: ${req.params.id}`);
    }
});

questionnairesRouter.post("/", async (req: Request, res: Response) => {

    try {       

        const newQuestionnaire = req.body as Questionnaire;
        
        const result = await collections.questionnaires?.insertOne(newQuestionnaire);

        result
            ? res.status(201).send(`Successfully created a new questionnaire with id ${result.insertedId}`)
            : res.status(500).send("Failed to create a new questionnaire.");

    } catch (error: any) {
        console.error(error);
        res.status(400).send(error.message);
    }
});

questionnairesRouter.put("/:id", async (req: Request, res: Response) => {

    const id = req?.params?.id;

    try {
        const updatedQuestionnaire: Questionnaire = req.body as Questionnaire;
        const query = { _id: new ObjectId(id) };

        const result = await collections.questionnaires?.updateOne(query, { $set: updatedQuestionnaire });
        
        if (result && result.modifiedCount) {
            res.status(202).send(`Successfully updated questionnaire with id ${id}`);
        } else if (!result) {
            res.status(400).send(`Failed to update questionnaire with id ${id}`);
        } else if (result.matchedCount) {
            res.status(304).send(`Questionnaire with id ${id} is already up to date`);
        } else {
            res.status(404).send(`Questionnaire with id ${id} does not exist`);
        }
        
    } catch (error: any) {
        console.error(error.message);
        res.status(400).send(error.message);
    }
});

questionnairesRouter.delete("/:id", async (req: Request, res: Response) => {
    
    const id = req?.params?.id;

    try {
        const query = { _id: new ObjectId(id) };
        const result = await collections.questionnaires?.deleteOne(query);

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