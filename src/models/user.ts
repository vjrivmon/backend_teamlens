import { ObjectId } from "mongodb";

/**
 * Modelo de Usuario para TeamLens
 * Representa un usuario del sistema (profesor o estudiante)
 */
export default class User {
    constructor(
        public email: string,
        public name: string,
        public password: string,
        public role: string,
        public askedQuestionnaires?: AskedQuestionnaire[],
        public activities?: ObjectId[],
        public groups?: ObjectId[],
        public resetToken?: string,
        public invitationToken?: string,
        public notifications?: INotification[],
        public isTemporary?: boolean,      // Indica si es una cuenta temporal pendiente de activación
        public createdAt?: Date,           // Fecha de creación de la cuenta
        public _id?: ObjectId
    ) { }
}

/**
 * Interfaz para representar un cuestionario respondido por el usuario
 */
export interface AskedQuestionnaire {
    questionnaire: ObjectId;
    result: string;
    completedAt?: Date;           // Fecha en que se completó el cuestionario
}

/**
 * Interfaz Enterprise para Notificaciones de Usuario
 * 
 * Modelo avanzado que soporta gestión granular, categorización inteligente
 * y seguimiento completo del estado de las notificaciones
 */
export interface INotification {
    _id?: ObjectId;                                   // ID único de la notificación
    title: string;                                    // Título de la notificación
    description: string;                              // Descripción detallada
    date?: string;                                    // Fecha formateada para mostrar al usuario
    timestamp?: Date;                                 // Timestamp exacto para ordenamiento
    link?: string;                                    // Enlace opcional para navegación
    
    // Propiedades enterprise para gestión avanzada
    read?: boolean;                                   // Estado de lectura
    type?: 'activity' | 'group' | 'system';         // Categorización inteligente
    priority?: 'high' | 'normal' | 'low';           // Sistema de prioridades
    icon?: string;                                    // Icono específico para cada tipo
    expiresAt?: Date;                                // Fecha de expiración automática
    actionRequired?: boolean;                        // Indica si requiere acción del usuario
    createdAt?: Date;                                // Fecha de creación
    updatedAt?: Date;                                // Fecha de última actualización
    
    // Metadatos adicionales para contexto y trazabilidad
    metadata?: {
        activityId?: ObjectId;                       // ID de actividad relacionada
        groupId?: ObjectId;                          // ID de grupo relacionado
        senderId?: ObjectId;                         // ID del usuario que generó la notificación
        originalEvent?: string;                      // Evento original que disparó la notificación
        [key: string]: any;                         // Metadatos adicionales flexibles
    };
}