import express, { Request, Response } from "express";


import { ObjectId } from "mongodb";
import { collections } from "../services/database.service";

import Group from "../models/group";
import Activity from "../models/activity";
import User from "../models/user";

import { handleGroupStudentsRouter } from "./handle-group-students.router";

import { createGroup, deleteGroup, getGroupsWithStudents } from "../functions/group-functions";
import { verifyTeacher, verifyToken } from "../middlewares";

import NotFoundError from "../functions/exceptions/NotFoundError";


export const groupsRouter = express.Router({ mergeParams: true });

/**
 * GET /activities/:activityId/groups
 * Obtiene los grupos de una actividad con filtrado basado en roles:
 * - Profesores: Ven todos los grupos de la actividad
 * - Estudiantes: Solo ven los grupos a los que pertenecen
 */
groupsRouter.get("/", verifyToken, async (req: Request, res: Response) => {
    const { activityId } = req?.params;
    const authUserId = (req as any).session?.authuser;

    console.log(`👥 [Groups] Obteniendo grupos para actividad: ${activityId}, usuario: ${authUserId}`);

    try {
        // Obtener información del usuario autenticado
        const user = await collections.users?.findOne<User>({ _id: new ObjectId(authUserId) });
        
        if (!user) {
            console.log(`❌ [Groups] Usuario no encontrado: ${authUserId}`);
            res.status(404).send({ message: "User not found" });
            return;
        }

        // Obtener todos los grupos de la actividad
        const query = { _id: new ObjectId(activityId) };
        const groupsId = (await collections.activities?.findOne<Activity>(query, { projection: { groups: 1 } }))?.groups;

        if (!groupsId || groupsId.length === 0) {
            console.log(`📋 [Groups] No hay grupos en la actividad: ${activityId}`);
            res.status(200).send([]);
            return;
        }

        // Obtener todos los grupos con estudiantes
        const allGroups = await getGroupsWithStudents(groupsId);

        if (!allGroups) {
            console.log(`📋 [Groups] Error obteniendo grupos con estudiantes`);
            res.status(500).send({ message: "Error retrieving groups" });
            return;
        }

        let filteredGroups;

        if (user.role === 'teacher') {
            // Los profesores ven todos los grupos
            filteredGroups = allGroups;
            console.log(`👨‍🏫 [Groups] Profesor ${user.email}: devolviendo ${allGroups.length} grupos`);
        } else {
            // Los estudiantes solo ven los grupos donde están incluidos
            const userObjectId = new ObjectId(authUserId);
            filteredGroups = allGroups.filter(group => {
                return group.students.some((student: any) => student._id.equals(userObjectId));
            });
            
            console.log(`👨‍🎓 [Groups] Estudiante ${user.email}: devolviendo ${filteredGroups.length} grupos de ${allGroups.length} totales`);
            
            // Log adicional para debugging
            if (filteredGroups.length > 0) {
                filteredGroups.forEach((group: any) => {
                    console.log(`   - Grupo: ${group.name} (${group._id})`);
                });
            } else {
                console.log(`   - Estudiante no pertenece a ningún grupo en esta actividad`);
            }
        }

        res.status(200).send(filteredGroups);

    } catch (error: any) {
        console.error(`💥 [Groups] Error obteniendo grupos:`, error);
        res.status(500).send({
            message: error.message
        });
    }
});

groupsRouter.get("/:id", verifyToken, async (req: Request, res: Response) => {
    const { id } = req?.params;
    const authUserId = (req as any).session?.authuser;

    console.log(`👥 [Groups] Obteniendo grupo individual: ${id}, usuario: ${authUserId}`);

    try {
        // Obtener información del usuario autenticado
        const user = await collections.users?.findOne<User>({ _id: new ObjectId(authUserId) });
        
        if (!user) {
            console.log(`❌ [Groups] Usuario no encontrado: ${authUserId}`);
            res.status(404).send({ message: "User not found" });
            return;
        }

        const group = await getGroupsWithStudents([new ObjectId(id)]) ?? [];

        if (group?.length > 0) {
            const foundGroup = group[0];

            // Aplicar filtrado basado en rol
            if (user.role === 'teacher') {
                // Los profesores pueden ver cualquier grupo
                console.log(`👨‍🏫 [Groups] Profesor ${user.email}: accediendo grupo ${foundGroup.name}`);
                res.status(200).send(foundGroup);
            } else {
                // Los estudiantes solo pueden ver grupos donde están incluidos
                const userObjectId = new ObjectId(authUserId);
                const canAccess = foundGroup.students.some((student: any) => student._id.equals(userObjectId));
                
                if (canAccess) {
                    console.log(`👨‍🎓 [Groups] Estudiante ${user.email}: accediendo a su grupo ${foundGroup.name}`);
                    res.status(200).send(foundGroup);
                } else {
                    console.log(`❌ [Groups] Estudiante ${user.email}: acceso denegado al grupo ${foundGroup.name}`);
                    res.status(403).send({ message: "Access denied to this group" });
                }
            }
        } else {
            res.status(404).send({ message: `Group with id ${id} not found` });
        }

    } catch (error) {
        console.error(`💥 [Groups] Error obteniendo grupo individual:`, error);
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