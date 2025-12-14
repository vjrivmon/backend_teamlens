/**
 * 🌐 TeamLens WebSocket Service
 * Sistema enterprise de comunicación en tiempo real
 * 
 * @author DevOps Senior - TeamLens
 * @version 1.0.0
 * 
 * FUNCIONALIDADES:
 * - Gestión de conexiones por usuario
 * - Notificaciones en tiempo real
 * - Sincronización de estados
 * - Sistema de eventos robusto
 */

import { Server as SocketIOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { ObjectId } from 'mongodb';
import { collections } from './database.service';

interface ConnectedUser {
    userId: string;
    userEmail: string;
    userName: string;
    userRole: string;
    socketId: string;
    connectedAt: Date;
    lastActivity: Date;
}

interface NotificationPayload {
    type: string;
    message: string;
    data?: any;
    timestamp?: string;
}

interface GroupNotificationPayload extends NotificationPayload {
    groupId: string;
    groupName: string;
    activityId?: string;
}

interface ActivityNotificationPayload extends NotificationPayload {
    activityId: string;
    activityName: string;
    groupId?: string;
}

/**
 * ==========================================================================
 * SERVICIO WEBSOCKET ENTERPRISE - COMUNICACIÓN TIEMPO REAL
 * ==========================================================================
 */

class WebSocketService {
    private io: SocketIOServer | null = null;
    private connectedUsers = new Map<string, ConnectedUser>(); // userId -> user info
    private userSockets = new Map<string, string>(); // userId -> socketId
    private socketUsers = new Map<string, string>(); // socketId -> userId

    /**
     * Inicializar el servicio WebSocket
     */
    public initialize(server: HTTPServer): void {
        console.log('🌐 [WebSocket] Inicializando servicio WebSocket...');

        // Configuración dinámica de CORS basada en el entorno
        const isProduction = process.env.NODE_ENV === 'production';
        const productionOrigin = process.env.FRONTEND_URL || 'http://teamlens.gti-ia.dsic.upv.es';

        const allowedOrigins = [
            "http://localhost:4200",  // Desarrollo
            "http://localhost:3000",  // Desarrollo alternativo
            productionOrigin,         // Producción
            "http://teamlens.gti-ia.dsic.upv.es"  // Producción explícita
        ];

        console.log(`🌐 [WebSocket] Configurando orígenes permitidos:`, allowedOrigins);
        console.log(`🌐 [WebSocket] Entorno: ${isProduction ? 'PRODUCCIÓN' : 'DESARROLLO'}`);

        this.io = new SocketIOServer(server, {
            cors: {
                origin: allowedOrigins,
                methods: ["GET", "POST"],
                credentials: true,
                allowedHeaders: ["Authorization", "Content-Type"]
            },
            transports: ['websocket', 'polling'],
            pingTimeout: 60000,
            pingInterval: 25000
        });

        // Middleware de autenticación
        this.io.use(async (socket, next) => {
            try {
                let token = socket.handshake.auth.token || socket.handshake.headers.authorization;

                if (!token) {
                    console.log('❌ [WebSocket] Conexión rechazada: Sin token');
                    return next(new Error('Authentication error: No token provided'));
                }

                // DEBUG: Log token info
                console.log(`🔐 [WebSocket] Token recibido (primeros 50 chars): ${token.substring(0, 50)}...`);
                console.log(`🔐 [WebSocket] Token length: ${token.length}`);

                // Si el token tiene prefijo "Bearer ", eliminarlo
                if (token.startsWith('Bearer ')) {
                    token = token.slice(7);
                    console.log(`🔐 [WebSocket] Token sin Bearer prefix`);
                }

                // Verificar JWT token
                const secret = process.env.JWT_SECRET || 'teamlens_secret_key';
                const decoded = jwt.verify(token, secret) as any;
                
                // Obtener información del usuario
                const user = await collections.users?.findOne({ _id: new ObjectId(decoded.id) });
                
                if (!user) {
                    console.log('❌ [WebSocket] Conexión rechazada: Usuario no encontrado');
                    return next(new Error('Authentication error: User not found'));
                }

                // Almacenar información del usuario en el socket
                socket.data.userId = user._id.toString();
                socket.data.userEmail = user.email;
                socket.data.userName = user.name;
                socket.data.userRole = user.role;

                console.log(`✅ [WebSocket] Usuario autenticado: ${user.email} (${user.role})`);
                next();

            } catch (error: any) {
                console.log('❌ [WebSocket] Error de autenticación:', error.message);
                next(new Error('Authentication error: Invalid token'));
            }
        });

        // Manejar conexiones
        this.io.on('connection', (socket) => {
            this.handleConnection(socket);
        });

        console.log('✅ [WebSocket] Servicio WebSocket inicializado correctamente');
    }

    /**
     * Manejar nueva conexión de usuario
     */
    private handleConnection(socket: Socket): void {
        const userId = socket.data.userId;
        const userEmail = socket.data.userEmail;
        const userName = socket.data.userName;
        const userRole = socket.data.userRole;

        console.log(`🔗 [WebSocket] Nueva conexión: ${userEmail} (${socket.id})`);

        // Registrar usuario conectado
        const connectedUser: ConnectedUser = {
            userId,
            userEmail,
            userName,
            userRole,
            socketId: socket.id,
            connectedAt: new Date(),
            lastActivity: new Date()
        };

        this.connectedUsers.set(userId, connectedUser);
        this.userSockets.set(userId, socket.id);
        this.socketUsers.set(socket.id, userId);

        // Unir a rooms basados en rol
        socket.join(`role_${userRole}`);
        socket.join(`user_${userId}`);

        console.log(`👥 [WebSocket] Usuario ${userEmail} unido a rooms: role_${userRole}, user_${userId}`);

        // Enviar notificaciones pendientes al conectarse
        this.sendPendingNotifications(userId);

        // Manejar eventos del cliente
        this.setupClientEvents(socket);

        // Manejar desconexión
        socket.on('disconnect', () => {
            this.handleDisconnection(socket);
        });

        // Confirmar conexión exitosa
        socket.emit('connection-confirmed', {
            message: 'Conectado exitosamente a TeamLens',
            userId,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Configurar eventos del cliente
     */
    private setupClientEvents(socket: Socket): void {
        const userId = socket.data.userId;

        // Ping para mantener conexión activa
        socket.on('ping', () => {
            socket.emit('pong');
            this.updateUserActivity(userId);
        });

        // Marcar notificación como leída
        socket.on('mark-notification-read', (data) => {
            console.log(`📖 [WebSocket] Usuario ${userId} marcó notificación como leída:`, data);
            // Aquí se puede agregar lógica adicional si es necesario
        });

        // Solicitar actualizaciones
        socket.on('request-updates', () => {
            this.sendPendingNotifications(userId);
        });

        // Actualizar actividad del usuario
        socket.on('user-activity', () => {
            this.updateUserActivity(userId);
        });
    }

    /**
     * Manejar desconexión de usuario
     */
    private handleDisconnection(socket: Socket): void {
        const userId = this.socketUsers.get(socket.id);
        
        if (userId) {
            const user = this.connectedUsers.get(userId);
            console.log(`📤 [WebSocket] Usuario desconectado: ${user?.userEmail} (${socket.id})`);

            this.connectedUsers.delete(userId);
            this.userSockets.delete(userId);
            this.socketUsers.delete(socket.id);
        }
    }

    /**
     * Actualizar actividad del usuario
     */
    private updateUserActivity(userId: string): void {
        const user = this.connectedUsers.get(userId);
        if (user) {
            user.lastActivity = new Date();
        }
    }

    /**
     * Enviar notificaciones pendientes al usuario
     */
    private async sendPendingNotifications(userId: string): Promise<void> {
        try {
            const user = await collections.users?.findOne({ _id: new ObjectId(userId) });
            
            if (user && user.notifications) {
                // Enviar solo notificaciones no leídas de las últimas 24 horas
                const last24Hours = new Date();
                last24Hours.setHours(last24Hours.getHours() - 24);

                const recentUnreadNotifications = user.notifications.filter(notification => {
                    const notificationDate = notification.timestamp || notification.createdAt;
                    return !notification.read && 
                           notificationDate && 
                           new Date(notificationDate) > last24Hours;
                });

                if (recentUnreadNotifications.length > 0) {
                    this.emitToUser(userId, 'pending-notifications', {
                        notifications: recentUnreadNotifications,
                        count: recentUnreadNotifications.length
                    });

                    console.log(`📬 [WebSocket] Enviadas ${recentUnreadNotifications.length} notificaciones pendientes a usuario ${userId}`);
                }
            }
        } catch (error: any) {
            console.error('❌ [WebSocket] Error enviando notificaciones pendientes:', error);
        }
    }

    /**
     * Emitir evento a un usuario específico
     */
    public emitToUser(userId: string, event: string, data: any): boolean {
        const socketId = this.userSockets.get(userId);
        
        if (socketId && this.io) {
            this.io.to(socketId).emit(event, {
                ...data,
                timestamp: new Date().toISOString()
            });
            
            console.log(`📡 [WebSocket] Evento '${event}' enviado a usuario ${userId}`);
            return true;
        }
        
        console.log(`⚠️ [WebSocket] Usuario ${userId} no está conectado para evento '${event}'`);
        return false;
    }

    /**
     * Emitir evento a múltiples usuarios
     */
    public emitToUsers(userIds: string[], event: string, data: any): number {
        let sentCount = 0;
        
        userIds.forEach(userId => {
            if (this.emitToUser(userId, event, data)) {
                sentCount++;
            }
        });
        
        console.log(`📡 [WebSocket] Evento '${event}' enviado a ${sentCount}/${userIds.length} usuarios`);
        return sentCount;
    }

    /**
     * Emitir evento a usuarios por rol
     */
    public emitToRole(role: string, event: string, data: any): void {
        if (this.io) {
            this.io.to(`role_${role}`).emit(event, {
                ...data,
                timestamp: new Date().toISOString()
            });
            
            console.log(`📡 [WebSocket] Evento '${event}' enviado a rol '${role}'`);
        }
    }

    /**
     * Broadcast a todos los usuarios conectados
     */
    public broadcast(event: string, data: any): void {
        if (this.io) {
            this.io.emit(event, {
                ...data,
                timestamp: new Date().toISOString()
            });
            
            console.log(`📡 [WebSocket] Broadcast '${event}' enviado a todos los usuarios`);
        }
    }

    /**
     * Obtener estadísticas de conexiones
     */
    public getConnectionStats(): any {
        const connectedByRole = {
            teacher: 0,
            student: 0,
            admin: 0
        };

        this.connectedUsers.forEach(user => {
            if (connectedByRole.hasOwnProperty(user.userRole)) {
                connectedByRole[user.userRole as keyof typeof connectedByRole]++;
            }
        });

        return {
            totalConnected: this.connectedUsers.size,
            connectedByRole,
            connectedUsers: Array.from(this.connectedUsers.values()).map(user => ({
                userId: user.userId,
                userEmail: user.userEmail,
                userName: user.userName,
                userRole: user.userRole,
                connectedAt: user.connectedAt,
                lastActivity: user.lastActivity
            }))
        };
    }

    /**
     * Verifica si un usuario está conectado
     */
    isUserConnected(userId: string): boolean {
        return this.connectedUsers.has(userId);
    }

    /**
     * Obtiene información de un usuario conectado
     */
    getUserInfo(userId: string): ConnectedUser | null {
        return this.connectedUsers.get(userId) || null;
    }

    /**
     * Obtener información de usuario conectado
     */
    public getConnectedUser(userId: string): ConnectedUser | undefined {
        return this.connectedUsers.get(userId);
    }

    /**
     * Desconectar un usuario específico
     */
    public disconnectUser(userId: string, reason: string = 'Server disconnect'): boolean {
        const socketId = this.userSockets.get(userId);
        
        if (socketId && this.io) {
            const socket = this.io.sockets.sockets.get(socketId);
            if (socket) {
                socket.emit('force-disconnect', { reason });
                socket.disconnect(true);
                console.log(`🔌 [WebSocket] Usuario ${userId} desconectado forzosamente: ${reason}`);
                return true;
            }
        }
        
        return false;
    }

    /**
     * Obtener instancia de Socket.IO
     */
    public getIO(): SocketIOServer | null {
        return this.io;
    }
}

// Instancia singleton
export const webSocketService = new WebSocketService();
export default webSocketService; 