import express, { Request, Response } from "express";
import { ObjectId } from "mongodb";
import { collections } from "../services/database.service";
import { webSocketService } from "../services/websocket.service";
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

/**
 * ==========================================================================
 * SISTEMA DE NOTIFICACIONES ENTERPRISE - ENDPOINTS GRANULARES
 * ==========================================================================
 */

/**
 * GET /users/notifications - Obtiene notificaciones paginadas con filtros
 * Soporta paginación, filtrado por tipo/estado/prioridad y búsqueda
 */
usersRouter.get("/notifications", async (req: Request, res: Response) => {
    const authUserId = req.session?.authuser as string;
    
    // Parámetros de paginación y filtros
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;
    
    // Filtros avanzados
    const typeFilter = req.query.type as string;
    const statusFilter = req.query.status as string;
    const priorityFilter = req.query.priority as string;
    const searchFilter = req.query.search as string;

    try {
        const user = await collections.users?.findOne<User>({ _id: new ObjectId(authUserId) });

        if (!user) {
            res.status(404).send(`User with id ${authUserId} does not exist`);
            return;
        }

        let notifications = user.notifications || [];

        // Aplicar filtros
        if (typeFilter && typeFilter !== 'all') {
            notifications = notifications.filter(n => n.type === typeFilter);
        }

        if (statusFilter && statusFilter !== 'all') {
            if (statusFilter === 'unread') {
                notifications = notifications.filter(n => !n.read);
            } else if (statusFilter === 'read') {
                notifications = notifications.filter(n => n.read);
            }
        }

        if (priorityFilter && priorityFilter !== 'all') {
            notifications = notifications.filter(n => n.priority === priorityFilter);
        }

        if (searchFilter) {
            const searchLower = searchFilter.toLowerCase();
            notifications = notifications.filter(n => 
                n.title.toLowerCase().includes(searchLower) || 
                n.description.toLowerCase().includes(searchLower)
            );
        }

        // Ordenar por timestamp (más recientes primero)
        notifications.sort((a, b) => {
            const aTime = a.timestamp || a.createdAt || new Date(0);
            const bTime = b.timestamp || b.createdAt || new Date(0);
            return new Date(bTime).getTime() - new Date(aTime).getTime();
        });

        // Paginación
        const total = notifications.length;
        const paginatedNotifications = notifications.slice(skip, skip + limit);
        const hasMore = skip + limit < total;

        // Agregar IDs únicos si no existen
        const notificationsWithIds = paginatedNotifications.map((notification, index) => ({
            ...notification,
            _id: notification._id || new ObjectId().toString()
        }));

        const response = {
            notifications: notificationsWithIds,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            },
            hasMore
        };

        console.log(`📄 Notificaciones entregadas: ${paginatedNotifications.length}/${total} para usuario ${authUserId}`);
        res.status(200).send(response);

    } catch (error: any) {
        console.error('❌ Error al obtener notificaciones:', error.message);
        res.status(400).send(error.message);
    }
});

/**
 * PATCH /users/notifications/:notificationId/read - Marca una notificación como leída
 */
usersRouter.patch("/notifications/:notificationId/read", async (req: Request, res: Response) => {
    const authUserId = req.session?.authuser as string;
    const { notificationId } = req.params;

    try {
        const result = await collections.users?.updateOne(
            { 
                _id: new ObjectId(authUserId),
                "notifications._id": new ObjectId(notificationId)
            },
            { 
                $set: { 
                    "notifications.$.read": true,
                    "notifications.$.updatedAt": new Date()
                }
            }
        );

        if (!result || result.matchedCount === 0) {
            res.status(404).send(`Notification with id ${notificationId} not found`);
            return;
        }

        // 🌐 WebSocket: Notificar cambio de estado en tiempo real
        webSocketService.emitToUser(authUserId, 'notification-read', {
            notificationId,
            read: true,
            timestamp: new Date().toISOString()
        });

        console.log(`✅ Notificación ${notificationId} marcada como leída para usuario ${authUserId}`);
        res.status(200).send({ 
            message: `Notification ${notificationId} marked as read`,
            notificationId,
            read: true
        });

    } catch (error: any) {
        console.error('❌ Error al marcar notificación como leída:', error.message);
        res.status(400).send(error.message);
    }
});

/**
 * PATCH /users/notifications/:notificationId/unread - Marca una notificación como no leída
 */
usersRouter.patch("/notifications/:notificationId/unread", async (req: Request, res: Response) => {
    const authUserId = req.session?.authuser as string;
    const { notificationId } = req.params;

    try {
        const result = await collections.users?.updateOne(
            { 
                _id: new ObjectId(authUserId),
                "notifications._id": new ObjectId(notificationId)
            },
            { 
                $set: { 
                    "notifications.$.read": false,
                    "notifications.$.updatedAt": new Date()
                }
            }
        );

        if (!result || result.matchedCount === 0) {
            res.status(404).send(`Notification with id ${notificationId} not found`);
            return;
        }

        // 🌐 WebSocket: Notificar cambio de estado en tiempo real
        webSocketService.emitToUser(authUserId, 'notification-unread', {
            notificationId,
            read: false,
            timestamp: new Date().toISOString()
        });

        console.log(`📩 Notificación ${notificationId} marcada como no leída para usuario ${authUserId}`);
        res.status(200).send({ 
            message: `Notification ${notificationId} marked as unread`,
            notificationId,
            read: false
        });

    } catch (error: any) {
        console.error('❌ Error al marcar notificación como no leída:', error.message);
        res.status(400).send(error.message);
    }
});

/**
 * DELETE /users/notifications/:notificationId - Elimina una notificación específica
 */
usersRouter.delete("/notifications/:notificationId", async (req: Request, res: Response) => {
    const authUserId = req.session?.authuser as string;
    const { notificationId } = req.params;

    try {
        const result = await collections.users?.updateOne(
            { _id: new ObjectId(authUserId) },
            { 
                $pull: { 
                    notifications: { _id: new ObjectId(notificationId) }
                }
            }
        );

        if (!result || result.matchedCount === 0) {
            res.status(404).send(`User or notification not found`);
            return;
        }

        // 🌐 WebSocket: Notificar eliminación en tiempo real
        webSocketService.emitToUser(authUserId, 'notification-deleted', {
            notificationId,
            timestamp: new Date().toISOString()
        });

        console.log(`🗑️ Notificación ${notificationId} eliminada para usuario ${authUserId}`);
        res.status(200).send({ 
            message: `Notification ${notificationId} deleted successfully`,
            notificationId
        });

    } catch (error: any) {
        console.error('❌ Error al eliminar notificación:', error.message);
        res.status(400).send(error.message);
    }
});

/**
 * PATCH /users/notifications/mark-all-read - Marca todas las notificaciones como leídas
 */
usersRouter.patch("/notifications/mark-all-read", async (req: Request, res: Response) => {
    const authUserId = req.session?.authuser as string;

    try {
        const result = await collections.users?.updateOne(
            { _id: new ObjectId(authUserId) },
            { 
                $set: { 
                    "notifications.$[].read": true,
                    "notifications.$[].updatedAt": new Date()
                }
            }
        );

        if (!result || result.matchedCount === 0) {
            res.status(404).send(`User with id ${authUserId} does not exist`);
            return;
        }

        // 🌐 WebSocket: Notificar que se marcaron todas como leídas
        webSocketService.emitToUser(authUserId, 'all-notifications-read', {
            userId: authUserId,
            timestamp: new Date().toISOString()
        });

        console.log(`📚 Todas las notificaciones marcadas como leídas para usuario ${authUserId}`);
        res.status(200).send({ 
            message: `All notifications marked as read for user ${authUserId}`,
            userId: authUserId
        });

    } catch (error: any) {
        console.error('❌ Error al marcar todas las notificaciones como leídas:', error.message);
        res.status(400).send(error.message);
    }
});

/**
 * POST /users/clear-notifications - Elimina todas las notificaciones (legacy + nuevo)
 */
usersRouter.post("/clear-notifications", async (req: Request, res: Response) => {
    const authUserId = req.session?.authuser as string;

    try {
        const result = await collections.users?.updateOne(
            { _id: new ObjectId(authUserId) },
            { 
                $unset: { notifications: 1 }
            }
        );

        if (!result || result.matchedCount === 0) {
            res.status(404).send(`User with id ${authUserId} does not exist`);
            return;
        }

        // 🌐 WebSocket: Notificar que se limpiaron todas las notificaciones
        webSocketService.emitToUser(authUserId, 'all-notifications-cleared', {
            userId: authUserId,
            timestamp: new Date().toISOString()
        });

        console.log(`🧹 Todas las notificaciones eliminadas para usuario ${authUserId}`);
        res.status(200).send({
            message: `Successfully cleared all notifications for user ${authUserId}`,
            userId: authUserId
        });

    } catch (error: any) {
        console.error('❌ Error al limpiar notificaciones:', error.message);
        res.status(400).send(error.message);
    }
});

/**
 * GET /users/notifications/stats - Obtiene estadísticas de notificaciones
 */
usersRouter.get("/notifications/stats", async (req: Request, res: Response) => {
    const authUserId = req.session?.authuser as string;

    try {
        const user = await collections.users?.findOne<User>({ _id: new ObjectId(authUserId) });

        if (!user) {
            res.status(404).send(`User with id ${authUserId} does not exist`);
            return;
        }

        const notifications = user.notifications || [];
        
        const stats = {
            total: notifications.length,
            unread: notifications.filter(n => !n.read).length,
            read: notifications.filter(n => n.read).length,
            byType: {
                activity: notifications.filter(n => n.type === 'activity').length,
                group: notifications.filter(n => n.type === 'group').length,
                system: notifications.filter(n => n.type === 'system').length
            },
            byPriority: {
                high: notifications.filter(n => n.priority === 'high').length,
                normal: notifications.filter(n => n.priority === 'normal').length,
                low: notifications.filter(n => n.priority === 'low').length
            }
        };

        console.log(`📊 Estadísticas de notificaciones entregadas para usuario ${authUserId}`);
        res.status(200).send(stats);

    } catch (error: any) {
        console.error('❌ Error al obtener estadísticas de notificaciones:', error.message);
        res.status(400).send(error.message);
    }
});

/**
 * GET /users/notifications/real-time-status - Estado en tiempo real con timestamp
 * Este endpoint permite al frontend verificar si hay cambios sin cargar todas las notificaciones
 */
usersRouter.get("/notifications/real-time-status", async (req: Request, res: Response) => {
    const authUserId = req.session?.authuser as string;
    const lastFetch = req.query.lastFetch as string;

    try {
        const user = await collections.users?.findOne<User>({ _id: new ObjectId(authUserId) });

        if (!user) {
            res.status(404).send(`User with id ${authUserId} does not exist`);
            return;
        }

        const notifications = user.notifications || [];
        const lastFetchTime = lastFetch ? new Date(lastFetch) : new Date(0);

        // Verificar si hay notificaciones nuevas o actualizadas desde la última consulta
        const hasUpdates = notifications.some(notification => {
            const notificationTime = notification.updatedAt || notification.createdAt || notification.timestamp;
            return notificationTime && new Date(notificationTime) > lastFetchTime;
        });

        const unreadCount = notifications.filter(n => !n.read).length;
        const latestNotification = notifications
            .sort((a, b) => {
                const aTime = a.timestamp || a.createdAt || new Date(0);
                const bTime = b.timestamp || b.createdAt || new Date(0);
                return new Date(bTime).getTime() - new Date(aTime).getTime();
            })[0];

        const status = {
            hasUpdates,
            unreadCount,
            totalCount: notifications.length,
            latestNotification: latestNotification ? {
                _id: latestNotification._id,
                title: latestNotification.title,
                timestamp: latestNotification.timestamp || latestNotification.createdAt
            } : null,
            serverTimestamp: new Date().toISOString(),
            websocketConnected: webSocketService.isUserConnected(authUserId)
        };

        res.status(200).send(status);

    } catch (error: any) {
        console.error('❌ Error al obtener estado en tiempo real:', error.message);
        res.status(400).send(error.message);
    }
});

/**
 * GET /users/notifications/quick-check - Verificación ultra-rápida para polling
 * Solo retorna si hay cambios, optimizado para ser llamado frecuentemente
 */
usersRouter.get("/notifications/quick-check", async (req: Request, res: Response) => {
    const authUserId = req.session?.authuser as string;
    const lastCount = parseInt(req.query.lastCount as string) || 0;
    const lastUnread = parseInt(req.query.lastUnread as string) || 0;

    try {
        const user = await collections.users?.findOne<User>(
            { _id: new ObjectId(authUserId) },
            { projection: { 'notifications.read': 1, 'notifications._id': 1 } }
        );

        if (!user) {
            res.status(404).send(`User with id ${authUserId} does not exist`);
            return;
        }

        const notifications = user.notifications || [];
        const currentCount = notifications.length;
        const currentUnread = notifications.filter(n => !n.read).length;

        const hasChanges = currentCount !== lastCount || currentUnread !== lastUnread;

        res.status(200).send({
            hasChanges,
            totalCount: currentCount,
            unreadCount: currentUnread,
            websocketConnected: webSocketService.isUserConnected(authUserId),
            timestamp: new Date().toISOString()
        });

    } catch (error: any) {
        console.error('❌ Error en verificación rápida:', error.message);
        res.status(400).send(error.message);
    }
});

/**
 * GET /users/websocket-status - Estado de la conexión WebSocket del usuario
 */
usersRouter.get("/websocket-status", async (req: Request, res: Response) => {
    const authUserId = req.session?.authuser as string;

    try {
        const isConnected = webSocketService.isUserConnected(authUserId);
        const userInfo = webSocketService.getUserInfo(authUserId);
        
        const status = {
            connected: isConnected,
            userId: authUserId,
            connectionInfo: userInfo ? {
                connectedAt: userInfo.connectedAt,
                email: userInfo.userEmail,
                role: userInfo.userRole
            } : null,
            serverTime: new Date().toISOString()
        };

        res.status(200).send(status);

    } catch (error: any) {
        console.error('❌ Error al obtener estado WebSocket:', error.message);
        res.status(400).send(error.message);
    }
});

usersRouter.get("/:id", async (req: Request, res: Response) => {

    const id = req?.params?.id;

    try {
        const query = { _id: new ObjectId(id) };
        const user = await collections.users?.findOne<User>(query);

        if (user) {
            res.status(200).send(user);
            return
        }

    } catch (error) {
        res.status(404).send(`Unable to find matching document with id: ${req.params.id}`);
    }
});

// this is same as the register auth route
// usersRouter.post("/", async (req: Request, res: Response) => {
//     try {

//         const newUser = req.body as User;

//         const result = await collections.users?.insertOne(newUser);

//         result
//             ? res.status(201).send(`Successfully created a new user with id ${result.insertedId}`)
//             : res.status(500).send("Failed to create a new user.");
//     } catch (error: any) {
//         console.error(error);
//         res.status(400).send(error.message);
//     }
// });

usersRouter.put("/:id", async (req: Request, res: Response) => {

    const id = req?.params?.id;

    try {
        const updatedUser: User = req.body as User;
        const query = { _id: new ObjectId(id) };

        const result = await collections.users?.updateOne(query, { $set: updatedUser });

        result
            ? res.status(202).send(`Successfully updated user with id ${id}`)
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

        if (!user) {
            res.status(404).send(`User with id ${id} does not exist`);
            return;
        }

        const activities = await collections.activities?.find<Activity[]>({ _id: { $in: user?.activities ?? [] } }).toArray();
        return res.status(200).send(activities);

    } catch (error: any) {
        console.error(error.message);
        return res.status(400).send(error.message);
    }
});

usersRouter.get("/:id/groups", async (req: Request, res: Response) => {

    const { id } = req?.params;

    try {
        const user = await collections.users?.findOne<User>({ _id: new ObjectId(id) });

        if (!user) {
            res.status(404).send(`User with id ${id} does not exist`);
            return
        }

        const groups = await collections.groups?.find<Group[]>({ _id: { $in: user?.groups ?? [] } }).toArray();
        res.status(200).send(groups);

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

