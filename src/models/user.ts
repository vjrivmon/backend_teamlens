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
}

/**
 * Interfaz para representar una notificación del usuario
 */
export interface INotification {
    title: string;
    description: string;
    date?: string;                // Fecha en formato string para mostrar al usuario
    timestamp?: Date;             // Timestamp exacto para ordenamiento
    link?: string;                // Enlace opcional para la notificación
    read?: boolean;               // Indicador de si la notificación ha sido leída
    type?: 'info' | 'warning' | 'success' | 'error'; // Tipo de notificación para styling
}