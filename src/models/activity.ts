import { ObjectId } from "mongodb";

/**
 * Configuración específica del algoritmo de formación de equipos para la actividad
 */
export interface AlgorithmConfig {
    /** Tamaño deseado de cada equipo */
    teamSize: number;
    
    /** Número mínimo de equipos a formar */
    minTeams?: number;
    
    /** Número máximo de equipos a formar */
    maxTeams?: number;
    
    /** Lista de pares de estudiantes que no pueden estar en el mismo equipo */
    exclusions?: string[];
    
    /** Lista de pares de estudiantes que deben estar en el mismo equipo */
    inclusions?: string[];
    
    /** Configuraciones adicionales del algoritmo */
    additionalConstraints?: any[];
    
    /** Función de agregación para el algoritmo (por defecto: "sum") */
    aggFunc?: string;
    
    /** Tipo de problema (por defecto: "TraitTeamFormation") */
    problemType?: string;
    
    /** Configurado por el profesor */
    isConfigured?: boolean;
    
    /** Fecha de última configuración */
    lastConfiguredAt?: Date;
}

export default class Activity {
    constructor(
        public title: string,
        public description: string,
        public teacher: ObjectId,
        public students?: ObjectId[],
        public groups?: ObjectId[],
        
        /** Configuración del algoritmo de formación de equipos */
        public algorithmConfig?: AlgorithmConfig,
        
        /** Estado del algoritmo: 'not-configured' | 'configured' | 'ready' | 'running' | 'done' | 'error' */
        public algorithmStatus?: string,
        
        /** Resultado del último algoritmo ejecutado */
        public algorithmResult?: any,
        
        /** Fecha de creación */
        public createdAt?: Date,
        
        /** Fecha de última actualización */
        public updatedAt?: Date,
        
        public _id?: ObjectId
    ) { }
}