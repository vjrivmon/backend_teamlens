import { ObjectId } from "mongodb";
import { INotification } from "../models/user";
import { collections } from "../services/database.service";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import emailService from "../services/email.service";

/**
 * Crea una cuenta temporal para un usuario no registrado y envía invitación por email
 * @param email Email del usuario a invitar
 * @returns ObjectId del usuario creado o undefined si hay error
 */
export const createNonRegisteredAccount = async (email: string): Promise<ObjectId | undefined> => {
    console.log(`👤 [UserFunctions] Iniciando creación de cuenta temporal para: ${email}`);

    try {
        // Verificar si el usuario ya existe
        const existingUser = await collections.users?.findOne({ email: email });

        if (existingUser) {
            console.log(`⚠️  [UserFunctions] Usuario ya existe: ${email}`);
            throw new Error(`Usuario con email ${email} ya existe en el sistema`);
        }

        // Generar datos del usuario temporal
        const name = email.split('@')[0];
        const temporalPassword = 'temporal_password_' + Date.now();

        console.log(`🔒 [UserFunctions] Generando credenciales temporales para: ${name}`);

        // Encriptar contraseña temporal
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(temporalPassword, salt);

        // Generar token de invitación seguro
        const jwtSecret = process.env.JWT_SECRET || "teamlens_secret_key";
        const invitationToken = jwt.sign(
            { 
                email: email, 
                type: 'invitation',
                createdAt: Date.now()
            }, 
            jwtSecret,
            { expiresIn: '7d' } // Token válido por 7 días
        );

        console.log(`🎫 [UserFunctions] Token de invitación generado para: ${email}`);

        // Crear objeto usuario temporal - usando cualquier tipo para evitar errores de compilación
        const newUser: any = {
            email: email,
            name: name,
            password: hashedPassword,
            role: "student",
            invitationToken: invitationToken,
            isTemporary: true, // Marcar como cuenta temporal
            createdAt: new Date()
        };

        // Insertar usuario en la base de datos
        console.log(`💾 [UserFunctions] Guardando usuario temporal en base de datos...`);
        const result = await collections.users?.insertOne(newUser);

        if (!result || !result.insertedId) {
            throw new Error('Error al guardar el usuario en la base de datos');
        }

        console.log(`✅ [UserFunctions] Usuario temporal creado con ID: ${result.insertedId}`);

        // Enviar email de invitación usando el nuevo método mejorado
        console.log(`📧 [UserFunctions] Enviando email de invitación...`);
        const emailResult = await emailService.sendStudentInvitation(email, invitationToken);

        if (emailResult.success) {
            console.log(`✅ [UserFunctions] Email de invitación enviado exitosamente a: ${email}`);
            console.log(`📧 [UserFunctions] Message ID: ${emailResult.messageId}`);
            
            // Log adicional en desarrollo
            if (process.env.NODE_ENV !== 'production' && emailResult.debugInfo) {
                console.log(`🔍 [UserFunctions] Debug info del email:`, emailResult.debugInfo);
            }
        } else {
            console.error(`❌ [UserFunctions] Error enviando email de invitación a: ${email}`);
            console.error(`❌ [UserFunctions] Error: ${emailResult.error}`);
            
            // En desarrollo, el email podría estar simulado
            if (emailResult.debugInfo && (emailResult.debugInfo as any).simulated) {
                console.log(`🧪 [UserFunctions] Email simulado en desarrollo - cuenta creada exitosamente`);
            } else {
                // En producción, si el email falla, eliminar el usuario temporal
                console.log(`🗑️  [UserFunctions] Eliminando usuario temporal debido a fallo de email...`);
                await collections.users?.deleteOne({ _id: result.insertedId });
                throw new Error(`Error enviando email de invitación: ${emailResult.error}`);
            }
        }

        console.log(`🎉 [UserFunctions] Proceso de invitación completado exitosamente para: ${email}`);
        return result.insertedId;

    } catch (error: any) {
        console.error(`❌ [UserFunctions] Error en createNonRegisteredAccount para ${email}:`, error);
        
        // Log detallado del error
        console.error(`❌ [UserFunctions] Stack trace:`, error.stack);
        
        // Re-lanzar el error con contexto adicional
        throw new Error(`Error creando cuenta temporal para ${email}: ${error.message}`);
    }
};

/**
 * Añade una notificación enterprise a un usuario con funcionalidades avanzadas
 * @param userId ID del usuario destinatario
 * @param notification Notificación a añadir con propiedades enterprise
 * @param options Opciones adicionales para la notificación
 */
export const addUserNotification = async (
    userId: ObjectId, 
    notification: INotification,
    options?: {
        senderId?: ObjectId;
        originalEvent?: string;
        autoExpire?: boolean;
        expirationDays?: number;
    }
): Promise<ObjectId> => {
    console.log(`🔔 [UserFunctions] Añadiendo notificación enterprise al usuario: ${userId}`);
    
    try {
        // Verificar que el usuario existe
        const user = await collections.users?.findOne({ _id: userId });

        if (!user) {
            console.error(`❌ [UserFunctions] Usuario no encontrado: ${userId}`);
            throw new Error(`Usuario con ID ${userId} no encontrado`);
        }

        // Generar ID único para la notificación
        const notificationId = new ObjectId();
        const now = new Date();
        
        // Configurar valores por defecto enterprise
        const defaultType = notification.type || 'system';
        const defaultPriority = notification.priority || 'normal';
        const defaultIcon = notification.icon || getDefaultIcon(defaultType);
        
        // Calcular fecha de expiración si se especifica
        let expiresAt: Date | undefined;
        if (options?.autoExpire) {
            const days = options.expirationDays || 30; // Default: 30 días
            expiresAt = new Date(now.getTime() + (days * 24 * 60 * 60 * 1000));
        }

        // Crear notificación enterprise completa
        const enterpriseNotification: INotification = {
            _id: notificationId,
            title: notification.title,
            description: notification.description,
            link: notification.link,
            date: now.toLocaleDateString('es-ES', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            }),
            timestamp: now,
            createdAt: now,
            updatedAt: now,
            
            // Propiedades enterprise
            read: false,                              // Nueva notificación siempre no leída
            type: defaultType,
            priority: defaultPriority,
            icon: defaultIcon,
            expiresAt,
            actionRequired: notification.actionRequired || false,
            
            // Metadatos para trazabilidad y contexto
            metadata: {
                senderId: options?.senderId,
                originalEvent: options?.originalEvent,
                ...notification.metadata
            }
        };

        console.log(`📝 [UserFunctions] Notificación Enterprise:`, {
            id: notificationId.toString(),
            title: enterpriseNotification.title,
            type: enterpriseNotification.type,
            priority: enterpriseNotification.priority,
            actionRequired: enterpriseNotification.actionRequired,
            expiresAt: enterpriseNotification.expiresAt,
            metadata: enterpriseNotification.metadata
        });

        // Añadir notificación al usuario usando $push con posición al inicio
        const result = await collections.users?.updateOne(
            { _id: userId }, 
            { 
                $push: { 
                    notifications: {
                        $each: [enterpriseNotification],
                        $position: 0  // Añadir al inicio para mostrar las más recientes primero
                    }
                } 
            }
        );

        if (result && result.modifiedCount > 0) {
            console.log(`✅ [UserFunctions] Notificación enterprise añadida exitosamente:`);
            console.log(`   - Usuario: ${userId}`);
            console.log(`   - ID Notificación: ${notificationId}`);
            console.log(`   - Tipo: ${enterpriseNotification.type}`);
            console.log(`   - Prioridad: ${enterpriseNotification.priority}`);
            
            // Log adicional para notificaciones de alta prioridad
            if (enterpriseNotification.priority === 'high') {
                console.log(`🚨 [UserFunctions] NOTIFICACIÓN DE ALTA PRIORIDAD enviada a usuario ${userId}`);
            }
            
            return notificationId;
        } else {
            console.log(`⚠️  [UserFunctions] No se pudo añadir la notificación al usuario: ${userId}`);
            throw new Error('No se pudo añadir la notificación');
        }

    } catch (error: any) {
        console.error(`❌ [UserFunctions] Error añadiendo notificación enterprise al usuario ${userId}:`, error);
        throw new Error(`Error añadiendo notificación: ${error.message}`);
    }
};

/**
 * Obtiene el icono por defecto según el tipo de notificación
 * @param type Tipo de notificación
 * @returns Nombre del icono correspondiente
 */
function getDefaultIcon(type: string): string {
    switch (type) {
        case 'activity': return 'tasks';
        case 'group': return 'users';
        case 'system': return 'cog';
        default: return 'bell';
    }
}

/**
 * Limpia notificaciones expiradas para un usuario específico
 * @param userId ID del usuario
 */
export const cleanupExpiredNotifications = async (userId: ObjectId): Promise<number> => {
    console.log(`🧹 [UserFunctions] Limpiando notificaciones expiradas para usuario: ${userId}`);
    
    try {
        const now = new Date();
        
        const result = await collections.users?.updateOne(
            { _id: userId },
            { 
                $pull: { 
                    notifications: { 
                        expiresAt: { $lt: now } 
                    } 
                } 
            }
        );

        const cleanedCount = result?.modifiedCount || 0;
        
        if (cleanedCount > 0) {
            console.log(`✅ [UserFunctions] ${cleanedCount} notificaciones expiradas eliminadas para usuario ${userId}`);
        }
        
        return cleanedCount;

    } catch (error: any) {
        console.error(`❌ [UserFunctions] Error limpiando notificaciones expiradas:`, error);
        throw new Error(`Error en limpieza de notificaciones: ${error.message}`);
    }
};

/**
 * Marca notificaciones automáticamente como leídas después de un tiempo determinado
 * @param userId ID del usuario
 * @param olderThanDays Marcar como leídas notificaciones más antiguas que X días
 */
export const autoMarkOldNotificationsAsRead = async (userId: ObjectId, olderThanDays: number = 7): Promise<number> => {
    console.log(`📚 [UserFunctions] Auto-marcando notificaciones antiguas como leídas para usuario: ${userId}`);
    
    try {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
        
        const result = await collections.users?.updateOne(
            { _id: userId },
            { 
                $set: { 
                    "notifications.$[elem].read": true,
                    "notifications.$[elem].updatedAt": new Date()
                } 
            },
            {
                arrayFilters: [{ 
                    "elem.timestamp": { $lt: cutoffDate },
                    "elem.read": { $ne: true }
                }]
            }
        );

        const markedCount = result?.modifiedCount || 0;
        
        if (markedCount > 0) {
            console.log(`✅ [UserFunctions] ${markedCount} notificaciones antiguas marcadas como leídas para usuario ${userId}`);
        }
        
        return markedCount;

    } catch (error: any) {
        console.error(`❌ [UserFunctions] Error en auto-marcado de notificaciones:`, error);
        throw new Error(`Error en auto-marcado: ${error.message}`);
    }
};