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
 * Añade una notificación a un usuario
 * @param userId ID del usuario
 * @param notification Notificación a añadir
 */
export const addUserNotification = async (userId: ObjectId, notification: INotification): Promise<void> => {
    console.log(`🔔 [UserFunctions] Añadiendo notificación al usuario: ${userId}`);
    
    try {
        // Verificar que el usuario existe
        const user = await collections.users?.findOne({ _id: userId });

        if (!user) {
            console.error(`❌ [UserFunctions] Usuario no encontrado: ${userId}`);
            throw new Error(`Usuario con ID ${userId} no encontrado`);
        }

        // Añadir timestamp a la notificación - usar any para evitar errores de tipo
        const notificationWithTimestamp: any = {
            ...notification,
            date: new Date().toLocaleDateString(),
            timestamp: new Date()
        };

        console.log(`📝 [UserFunctions] Notificación:`, {
            title: notification.title,
            description: notification.description,
            link: notification.link,
            date: notificationWithTimestamp.date
        });

        // Añadir notificación al usuario
        const result = await collections.users?.updateOne(
            { _id: userId }, 
            { $push: { notifications: notificationWithTimestamp } }
        );

        if (result && result.modifiedCount > 0) {
            console.log(`✅ [UserFunctions] Notificación añadida exitosamente al usuario: ${userId}`);
        } else {
            console.log(`⚠️  [UserFunctions] No se pudo añadir la notificación al usuario: ${userId}`);
        }

    } catch (error: any) {
        console.error(`❌ [UserFunctions] Error añadiendo notificación al usuario ${userId}:`, error);
        throw new Error(`Error añadiendo notificación: ${error.message}`);
    }
};