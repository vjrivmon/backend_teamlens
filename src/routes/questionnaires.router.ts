import express, { Request, Response } from "express";
import { ObjectId } from "mongodb";
import { collections } from "../services/database.service";
import Questionnaire from "../models/questionnaire";
import User from "../models/user";

export const questionnairesRouter = express.Router();

questionnairesRouter.get("/", async (_req: Request, res: Response) => {
    try {
        const questionnaires = await collections.questionnaires?.find<Questionnaire[]>({ enabled: true }).toArray();
        res.status(200).send(questionnaires);
    } catch (error: any) {
        res.status(500).send({
            message: error.message
        });
    }
});

questionnairesRouter.get("/asked", async (req: Request, res: Response) => {

    const authUserId = req.session?.authuser as string;
    
    try {
        const user = await collections.users?.findOne<User>({ _id: new ObjectId(authUserId) });

        if(!user) {
            res.status(404).send({
                message: `User with id ${authUserId} does not exist`
            });
        }

        res.status(200).send(user?.askedQuestionnaires ?? []);

    } catch (error: any) {
        res.status(500).send({
            message: error.message
        });
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
        res.status(404).send({
            message: `Unable to find matching document with id: ${id}`
        });
    }
});

questionnairesRouter.post("/", async (req: Request, res: Response) => {

    try {

        const newQuestionnaire = req.body as Questionnaire;

        const result = await collections.questionnaires?.insertOne(newQuestionnaire);

        result
            ? res.status(201).send({
                message: `Successfully created a new questionnaire with id ${result.insertedId}`
            })
            : res.status(500).send({
                message: "Failed to create a new questionnaire."
            })

    } catch (error: any) {
        console.error(error);
        res.status(400).send({
            message: error.message
        });
    }
});

questionnairesRouter.put("/:id", async (req: Request, res: Response) => {

    const id = req?.params?.id;

    try {
        const updatedQuestionnaire: Questionnaire = req.body as Questionnaire;
        const query = { _id: new ObjectId(id) };

        const result = await collections.questionnaires?.updateOne(query, { $set: updatedQuestionnaire });

        if (result && result.modifiedCount) {
            res.status(202).send({
                message: `Successfully updated questionnaire with id ${id}`
            });
        } else if (!result) {
            res.status(400).send({
                message: `Failed to update questionnaire with id ${id}`
            });
        } else if (result.matchedCount) {
            res.status(304).send({
                message: `Questionnaire with id ${id} is already up to date`
            });
        } else {
            res.status(404).send({
                message: `Questionnaire with id ${id} does not exist`
            });
        }

    } catch (error: any) {
        console.error(error.message);
        res.status(400).send({
            message: error.message
        });
    }
});

questionnairesRouter.put("/:id/submit", async (req: Request, res: Response) => {

    const id = req?.params?.id;

    const authUserId = req.session?.authuser as string;

    try {

        const authUserObjectId = new ObjectId(authUserId);

        const testValues = req.body;

        const result = await collections.questionnaires?.findOne<Questionnaire>({ _id: new ObjectId(id) });

        if(!result) {
            res.status(404).send({
                message: `Questionnaire with id ${id} does not exist`
            });
        }

        if (result?.questionnaireType == "BELBIN") {

            const roles = getBelbinMainRoles(testValues);
            const belbinResult = Object.keys(roles[0])[0];
            const completionDate = new Date();

            console.log(`🎯 [Questionnaires] Resultado Belbin calculado para usuario ${authUserId}: ${belbinResult}`);

            // Verificar si ya existe una respuesta previa para este cuestionario
            const existingResponse = await collections.users?.findOne({
                _id: authUserObjectId,
                "askedQuestionnaires.questionnaire": new ObjectId(id)
            });

            let updateResult;

            if (existingResponse) {
                // Actualizar respuesta existente
                console.log(`🔄 [Questionnaires] Actualizando respuesta existente para usuario ${authUserId}`);
                updateResult = await collections.users?.updateOne(
                    { 
                        _id: authUserObjectId, 
                        "askedQuestionnaires.questionnaire": new ObjectId(id) 
                    },
                    {
                        $set: {
                            "askedQuestionnaires.$.result": belbinResult,
                            "askedQuestionnaires.$.completedAt": completionDate
                        }
                    }
                );
            } else {
                // Crear nueva respuesta
                console.log(`➕ [Questionnaires] Creando nueva respuesta para usuario ${authUserId}`);
                updateResult = await collections.users?.updateOne(
                    { _id: authUserObjectId },
                    {
                        $push: {
                            askedQuestionnaires: {
                                questionnaire: new ObjectId(id),
                                result: belbinResult,
                                completedAt: completionDate
                            }
                        }
                    }
                );
            }

            // Verificar que la actualización fue exitosa
            if (updateResult && (updateResult.modifiedCount > 0 || updateResult.matchedCount > 0)) {
                console.log(`✅ [Questionnaires] Cuestionario guardado exitosamente para usuario ${authUserId}`);
                
                // Obtener información del usuario para logs
                const user = await collections.users?.findOne({ _id: authUserObjectId });
                console.log(`📧 [Questionnaires] Email del usuario: ${user?.email} - Resultado: ${belbinResult}`);
                
                res.status(200).send({
                    message: "success", 
                    data: {
                        questionnaire: id,
                        result: belbinResult,
                        userEmail: user?.email,
                        completedAt: completionDate.toISOString()
                    }
                });
            } else {
                console.error(`❌ [Questionnaires] Error guardando cuestionario para usuario ${authUserId}`);
                res.status(400).send({
                    message: `Failed to save questionnaire with id ${id}`
                });
            }
        }

    } catch (error: any) {
        console.error(error.message);
        res.status(400).send({
            message: error.message
        });
    }
});

questionnairesRouter.delete("/:id", async (req: Request, res: Response) => {

    const id = req?.params?.id;

    try {
        const query = { _id: new ObjectId(id) };
        const result = await collections.questionnaires?.deleteOne(query);

        if (result && result.deletedCount) {
            res.status(200).send({
                message: `Successfully removed activity with id ${id}`
            });
        } else if (!result) {
            res.status(400).send({
                message: `Failed to remove activity with id ${id}`
            });
        } else if (!result.deletedCount) {
            res.status(404).send({
                message: `Activity with id ${id} does not exist`
            });
        }
    } catch (error: any) {
        console.error(error.message);
        res.status(400).send({
            message: error.message
        });
    }
});

/**
 * Endpoint para obtener estadísticas de completitud de cuestionarios por actividad
 * Devuelve el número de estudiantes que han completado cada cuestionario
 * @route GET /questionnaires/activity/:activityId/stats
 * @param {string} activityId - ID de la actividad
 * @returns {Object} Estadísticas de completitud por cuestionario
 */
questionnairesRouter.get("/activity/:activityId/stats", async (req: Request, res: Response) => {
    const activityId = req?.params?.activityId;

    try {
        // Obtener todos los cuestionarios habilitados
        const questionnaires = await collections.questionnaires?.find<Questionnaire>({ enabled: true }).toArray();
        
        if (!questionnaires || questionnaires.length === 0) {
            res.status(200).send([]);
            return;
        }

        // Obtener todos los estudiantes de la actividad
        const activity = await collections.activities?.findOne({ _id: new ObjectId(activityId) });
        
        if (!activity) {
            res.status(404).send({
                message: `Activity with id ${activityId} does not exist`
            });
            return;
        }

        const studentIds = activity.students || [];
        const totalStudents = studentIds.length;

        // Crear el pipeline de agregación para contar las respuestas por cuestionario
        const statsPromises = questionnaires.map(async (questionnaire) => {
            // Contar cuántos estudiantes de esta actividad han respondido este cuestionario
            const completedCount = await collections.users?.countDocuments({
                _id: { $in: studentIds },
                "askedQuestionnaires.questionnaire": questionnaire._id
            });

            return {
                questionnaireId: questionnaire._id,
                questionnaireTitle: questionnaire.title,
                questionnaireType: questionnaire.questionnaireType,
                totalStudents: totalStudents,
                completedCount: completedCount || 0,
                completionPercentage: totalStudents > 0 ? Math.round((completedCount || 0) / totalStudents * 100) : 0
            };
        });

        const stats = await Promise.all(statsPromises);

        res.status(200).send(stats);

    } catch (error: any) {
        console.error(error.message);
        res.status(500).send({
            message: error.message
        });
    }
});

function getBelbinMainRoles(testValues: any) {

    const roleScore = new Array(Object.values(testValues).length + 1).fill(0);

    Object.values(testValues).forEach((value: any) => {
        for (let j = 0; j < Object.values(value).length; j++) {
            const v = Object.values(value)[j];
            // console.log(roleScore[j], v);
            roleScore[j] = roleScore[j] + Number(v);
        }
    });

    const roles = [
        { SH: roleScore[0] },
        { CO: roleScore[1] }, // CH
        { PL: roleScore[2] },
        { RI: roleScore[3] },
        { ME: roleScore[4] },
        { IM: roleScore[5] }, // CW
        { TW: roleScore[6] },
        { CF: roleScore[7] },
    ];

    roles.sort((a, b) => {
        return Object.values(b)[0] - Object.values(a)[0];
    });

    return roles;
}