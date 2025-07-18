import { ObjectId } from "mongodb";

/**
 * Tipo para el estado de los grupos
 * - draft: Creado por algoritmo, pendiente de revisión del profesor
 * - confirmed: Confirmado por el profesor, notificaciones enviadas
 */
export type GroupStatus = 'draft' | 'confirmed';

/**
 * Tipo para el método de creación del grupo
 */
export type GroupCreationMethod = 'manual' | 'algorithm';

export default class Group {
    constructor(
        public name: string,
        public students: ObjectId[],
        public activity: ObjectId,
        public status: GroupStatus = 'draft', // Por defecto en borrador
        public creationMethod: GroupCreationMethod = 'manual',
        public createdAt: Date = new Date(),
        public confirmedAt?: Date,
        public confirmedBy?: ObjectId, // ID del profesor que confirmó
        public metadata?: {
            algorithmVersion?: string;
            taskId?: string;
            teamSize?: number;
            [key: string]: any;
        },
        public _id?: ObjectId
    ) { }

    /**
     * Método para confirmar el grupo
     */
    confirm(teacherId: ObjectId): void {
        this.status = 'confirmed';
        this.confirmedAt = new Date();
        this.confirmedBy = teacherId;
    }

    /**
     * Verificar si el grupo está en borrador
     */
    isDraft(): boolean {
        return this.status === 'draft';
    }

    /**
     * Verificar si el grupo está confirmado
     */
    isConfirmed(): boolean {
        return this.status === 'confirmed';
    }
}