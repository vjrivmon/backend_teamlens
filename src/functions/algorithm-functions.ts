import { ObjectId } from "mongodb";
import { collections } from "../services/database.service";
import * as fs from 'fs';
import * as path from 'path';

/**
 * Interfaz para definir la estructura del archivo JSON del algoritmo
 * ACTUALIZADA: Incluye IDs para correlación perfecta con worker
 */
interface AlgorithmMember {
    id: string;        // ID del estudiante para correlación perfecta
    email: string;     // Email para debugging y logs  
    traits: string[];  // BELBIN traits o array vacío para estudiantes sin BELBIN
}

interface AlgorithmConstraint {
    type: string;
    name: string;
    number_members?: number;
    team_size?: number;
    min?: number;
    max?: number;
    members?: number[];
}

interface AlgorithmData {
    number_members: number;  // TOTAL de estudiantes, no tamaño del equipo
    members: AlgorithmMember[];
    agg_func: string;
    constraints: AlgorithmConstraint[];
    traits: string[];
    problem_type: string;
}

/**
 * Lista fija de traits BELBIN requerida por el algoritmo
 */
const BELBIN_TRAITS = ["TW", "CW", "CH", "ME", "CF", "SH", "PL", "RI"];

/**
 * Genera el nombre del archivo JSON para una actividad específica
 * @param activityId ID de la actividad
 * @returns Nombre del archivo JSON
 */
export const generateAlgorithmFileName = (activityId: string): string => {
    return `activity_${activityId}_belbin.json`;
};

/**
 * Obtiene la ruta completa del archivo JSON del algoritmo
 * @param activityId ID de la actividad
 * @returns Ruta completa del archivo
 */
export const getAlgorithmFilePath = (activityId: string): string => {
    const fileName = generateAlgorithmFileName(activityId);
    // Ruta relativa desde el backend hacia pyteamformation/instances
    return path.join(__dirname, '../../../pyteamformation/instances', fileName);
};

/**
 * Verifica si al menos algunos estudiantes de una actividad han completado el test BELBIN
 * MODIFICADO: Ya no requiere que TODOS hayan completado, solo que haya al menos algunos
 * @param activityId ID de la actividad
 * @returns Promise<boolean> true si al menos algunos han completado BELBIN
 */
export const validateMinimumStudentsWithBelbin = async (activityId: string): Promise<boolean> => {
    console.log(`🔍 [AlgorithmFunctions] Validando que haya estudiantes con BELBIN para actividad: ${activityId}`);

    try {
        // Obtener la actividad y sus estudiantes
        const activity = await collections.activities?.findOne({ _id: new ObjectId(activityId) });
        
        if (!activity || !activity.students || activity.students.length === 0) {
            console.log(`⚠️ [AlgorithmFunctions] Actividad sin estudiantes: ${activityId}`);
            return false;
        }

        console.log(`👥 [AlgorithmFunctions] Validando ${activity.students.length} estudiantes...`);

        // Verificar que al menos algunos estudiantes han completado BELBIN
        const studentsWithBelbin = await collections.users?.find({
            _id: { $in: activity.students },
            "askedQuestionnaires.questionnaire": { $exists: true },
            "askedQuestionnaires": {
                $elemMatch: {
                    "result": { $in: BELBIN_TRAITS }
                }
            }
        }).toArray();

        const completedCount = studentsWithBelbin?.length || 0;
        const totalCount = activity.students.length;
        
        console.log(`📊 [AlgorithmFunctions] BELBIN completado: ${completedCount}/${totalCount}`);

        if (completedCount > 0) {
            console.log(`✅ [AlgorithmFunctions] ${completedCount} estudiantes han completado BELBIN - algoritmo puede proceder`);
            return true;
        } else {
            console.log(`❌ [AlgorithmFunctions] Ningún estudiante ha completado BELBIN`);
            return false;
        }

    } catch (error: any) {
        console.error(`💥 [AlgorithmFunctions] Error validando BELBIN:`, error);
        return false;
    }
};

/**
 * Verifica si todos los estudiantes de una actividad han completado el test BELBIN
 * MANTENIDA: Para retrocompatibilidad con otras funciones
 * @param activityId ID de la actividad
 * @returns Promise<boolean> true si todos han completado BELBIN
 */
export const validateAllStudentsCompletedBelbin = async (activityId: string): Promise<boolean> => {
    console.log(`🔍 [AlgorithmFunctions] Validando BELBIN completado para actividad: ${activityId}`);

    try {
        // Obtener la actividad y sus estudiantes
        const activity = await collections.activities?.findOne({ _id: new ObjectId(activityId) });
        
        if (!activity || !activity.students || activity.students.length === 0) {
            console.log(`⚠️ [AlgorithmFunctions] Actividad sin estudiantes: ${activityId}`);
            return false;
        }

        console.log(`👥 [AlgorithmFunctions] Validando ${activity.students.length} estudiantes...`);

        // Verificar que todos los estudiantes han completado BELBIN
        const studentsWithBelbin = await collections.users?.find({
            _id: { $in: activity.students },
            "askedQuestionnaires.questionnaire": { $exists: true },
            "askedQuestionnaires": {
                $elemMatch: {
                    "result": { $in: BELBIN_TRAITS }
                }
            }
        }).toArray();

        const completedCount = studentsWithBelbin?.length || 0;
        const totalCount = activity.students.length;
        
        console.log(`📊 [AlgorithmFunctions] BELBIN completado: ${completedCount}/${totalCount}`);

        if (completedCount === totalCount) {
            console.log(`✅ [AlgorithmFunctions] Todos los estudiantes han completado BELBIN`);
            return true;
        } else {
            console.log(`❌ [AlgorithmFunctions] ${totalCount - completedCount} estudiantes pendientes de completar BELBIN`);
            return false;
        }

    } catch (error: any) {
        console.error(`💥 [AlgorithmFunctions] Error validando BELBIN:`, error);
        return false;
    }
};

/**
 * MODIFICADO: Obtiene TODOS los miembros de una actividad con sus traits BELBIN
 * Incluye estudiantes SIN BELBIN con traits vacíos []
 * AHORA INCLUYE IDs para correlación perfecta con worker
 * @param activityId ID de la actividad
 * @returns Promise<AlgorithmMember[]> lista con todos los miembros y sus traits + IDs
 */
export const getActivityMembersWithTraits = async (activityId: string): Promise<AlgorithmMember[]> => {
    console.log(`👥 [AlgorithmFunctions] Obteniendo TODOS los miembros con traits para actividad: ${activityId}`);

    try {
        const activity = await collections.activities?.findOne({ _id: new ObjectId(activityId) });
        
        if (!activity || !activity.students) {
            console.log(`⚠️ [AlgorithmFunctions] Actividad sin estudiantes válidos`);
            return [];
        }

        // Obtener TODOS los estudiantes de la actividad
        const allStudents = await collections.users?.find({
            _id: { $in: activity.students }
        }).toArray();

        if (!allStudents || allStudents.length === 0) {
            console.log(`⚠️ [AlgorithmFunctions] No se encontraron estudiantes en la actividad`);
            return [];
        }

        let studentsWithBelbin = 0;
        let studentsWithoutBelbin = 0;

        const members: AlgorithmMember[] = allStudents.map(student => {
            // Buscar el resultado BELBIN del estudiante
            const belbinQuestionnaire = student.askedQuestionnaires?.find(aq => 
                BELBIN_TRAITS.includes(aq.result)
            );

            const primaryTrait = belbinQuestionnaire?.result || "";
            
            // Si tiene BELBIN, usar el trait; si no, array vacío
            const traits = primaryTrait ? [primaryTrait] : [];

            if (traits.length > 0) {
                studentsWithBelbin++;
                console.log(`📝 [AlgorithmFunctions] Estudiante ${student.email}: ${traits.join(', ')}`);
            } else {
                studentsWithoutBelbin++;
                console.log(`📝 [AlgorithmFunctions] Estudiante ${student.email}: sin BELBIN - traits vacíos`);
            }

            return {
                id: student._id.toString(),  // NUEVO: Incluir ID para correlación perfecta
                email: student.email,        // NUEVO: Para debugging y logs
                traits: traits               // BELBIN traits o array vacío
            };
        });

        console.log(`✅ [AlgorithmFunctions] ${members.length} miembros procesados:`);
        console.log(`   📊 Con BELBIN: ${studentsWithBelbin}`);
        console.log(`   📊 Sin BELBIN: ${studentsWithoutBelbin}`);
        console.log(`   📊 El algoritmo puede proceder con estudiantes con traits vacíos`);
        
        return members;

    } catch (error: any) {
        console.error(`💥 [AlgorithmFunctions] Error obteniendo miembros:`, error);
        return [];
    }
};

/**
 * Genera las constraints básicas para el algoritmo
 * CORREGIDO: Usa SIEMPRE los parámetros del profesor, sin cálculos automáticos
 * @param activityId ID de la actividad
 * @param numberOfMembers Número total de miembros
 * @param teamSize Tamaño de cada equipo (del profesor)
 * @param minTeams Número mínimo de equipos (del profesor)
 * @param maxTeams Número máximo de equipos (del profesor)
 * @returns AlgorithmConstraint[] Array de constraints
 */
export const generateBasicConstraints = (
    activityId: string,
    numberOfMembers: number,
    teamSize: number,
    minTeams: number,
    maxTeams: number
): AlgorithmConstraint[] => {
    console.log(`🔧 [AlgorithmFunctions] Generando constraints básicas para actividad: ${activityId}`);
    console.log(`📊 [AlgorithmFunctions] Parámetros del profesor: ${numberOfMembers} miembros, equipos de ${teamSize}, min: ${minTeams}, max: ${maxTeams}`);

    const constraints: AlgorithmConstraint[] = [
        {
            type: "AllAssigned",
            name: "",
            number_members: numberOfMembers // Total de estudiantes
        },
        {
            type: "NonOverlapping",
            name: ""
        },
        {
            type: "SizeCardinality",
            name: "",
            team_size: teamSize,  // Tamaño de cada equipo (del profesor)
            min: minTeams,        // Número mínimo de equipos (del profesor)
            max: maxTeams         // Número máximo de equipos (del profesor)
        }
    ];

    console.log(`✅ [AlgorithmFunctions] ${constraints.length} constraints básicas generadas con parámetros del profesor`);
    return constraints;
};

/**
 * Genera el archivo JSON completo para el algoritmo
 * CORREGIDO: Usa SIEMPRE los parámetros del profesor, sin cálculos automáticos
 * @param activityId ID de la actividad
 * @param teamSize Tamaño deseado de cada equipo (del profesor)
 * @param minTeams Número mínimo de equipos (del profesor)
 * @param maxTeams Número máximo de equipos (del profesor)
 * @param customConstraints Constraints adicionales del profesor (opcional)
 * @returns Promise<AlgorithmData | null> Datos del algoritmo o null si hay error
 */
export const generateAlgorithmJSON = async (
    activityId: string,
    teamSize: number,
    minTeams: number,
    maxTeams: number,
    customConstraints: AlgorithmConstraint[] = []
): Promise<AlgorithmData | null> => {
    console.log(`🚀 [AlgorithmFunctions] Generando JSON del algoritmo para actividad: ${activityId}`);
    console.log(`📏 [AlgorithmFunctions] Parámetros del profesor: tamaño=${teamSize}, min=${minTeams}, max=${maxTeams}`);

    try {
        // Validar que al menos algunos estudiantes han completado BELBIN
        const hasMinimumBelbin = await validateMinimumStudentsWithBelbin(activityId);
        if (!hasMinimumBelbin) {
            console.error(`❌ [AlgorithmFunctions] No hay estudiantes con BELBIN completado - algoritmo requiere al menos algunos`);
            return null;
        }

        // Obtener TODOS los miembros con traits (incluye estudiantes sin BELBIN con traits vacíos)
        const members = await getActivityMembersWithTraits(activityId);
        if (members.length === 0) {
            console.error(`❌ [AlgorithmFunctions] No hay miembros válidos para el algoritmo`);
            return null;
        }

        const numberOfMembers = members.length;  // Total de estudiantes

        console.log(`🧮 [AlgorithmFunctions] Distribución: ${numberOfMembers} miembros en ${minTeams}-${maxTeams} equipos de ${teamSize}`);

        // Generar constraints básicas usando parámetros del profesor
        const basicConstraints = generateBasicConstraints(activityId, numberOfMembers, teamSize, minTeams, maxTeams);
        
        // Combinar constraints básicas con customs
        const allConstraints = [...basicConstraints, ...customConstraints];

        // CORREGIDO: Construir datos del algoritmo según plantilla Python
        const algorithmData: AlgorithmData = {
            number_members: numberOfMembers,  // TOTAL de estudiantes, no tamaño del equipo
            members: members,  // Solo traits, sin IDs
            agg_func: "sum",
            constraints: allConstraints,
            traits: BELBIN_TRAITS,
            problem_type: "TraitTeamFormation"
        };

        console.log(`✅ [AlgorithmFunctions] JSON del algoritmo generado exitosamente`);
        console.log(`📋 [AlgorithmFunctions] Resumen: ${members.length} miembros, ${allConstraints.length} constraints`);
        console.log(`🎯 [AlgorithmFunctions] Parámetros del profesor respetados: ${teamSize} por equipo, ${minTeams}-${maxTeams} equipos`);

        return algorithmData;

    } catch (error: any) {
        console.error(`💥 [AlgorithmFunctions] Error generando JSON del algoritmo:`, error);
        return null;
    }
};

/**
 * Guarda el archivo JSON del algoritmo en el sistema de archivos
 * @param activityId ID de la actividad
 * @param algorithmData Datos del algoritmo
 * @returns Promise<string | null> Ruta del archivo guardado o null si hay error
 */
export const saveAlgorithmJSON = async (
    activityId: string, 
    algorithmData: AlgorithmData
): Promise<string | null> => {
    console.log(`💾 [AlgorithmFunctions] Guardando archivo JSON para actividad: ${activityId}`);

    try {
        const filePath = getAlgorithmFilePath(activityId);
        const directory = path.dirname(filePath);

        // Crear directorio si no existe
        if (!fs.existsSync(directory)) {
            fs.mkdirSync(directory, { recursive: true });
            console.log(`📁 [AlgorithmFunctions] Directorio creado: ${directory}`);
        }

        // Convertir a JSON con formato legible
        const jsonContent = JSON.stringify(algorithmData, null, 2);

        // Guardar archivo
        fs.writeFileSync(filePath, jsonContent, 'utf8');

        console.log(`✅ [AlgorithmFunctions] Archivo guardado exitosamente: ${filePath}`);
        console.log(`📊 [AlgorithmFunctions] Tamaño del archivo: ${jsonContent.length} bytes`);

        return filePath;

    } catch (error: any) {
        console.error(`💥 [AlgorithmFunctions] Error guardando archivo JSON:`, error);
        return null;
    }
};

/**
 * Función principal que genera y guarda el archivo JSON del algoritmo
 * CORREGIDO: Usa SIEMPRE los parámetros del profesor
 * @param activityId ID de la actividad
 * @param teamSize Tamaño deseado de cada equipo (del profesor)
 * @param minTeams Número mínimo de equipos (del profesor)
 * @param maxTeams Número máximo de equipos (del profesor)
 * @param customConstraints Constraints adicionales del profesor (opcional)
 * @returns Promise<string | null> Ruta del archivo generado o null si hay error
 */
export const createAlgorithmFileForActivity = async (
    activityId: string,
    teamSize: number,
    minTeams: number,
    maxTeams: number,
    customConstraints: AlgorithmConstraint[] = []
): Promise<string | null> => {
    console.log(`🎯 [AlgorithmFunctions] INICIO - Creando archivo de algoritmo para actividad: ${activityId}`);
    console.log(`📊 [AlgorithmFunctions] Parámetros del profesor: tamaño=${teamSize}, min=${minTeams}, max=${maxTeams}`);

    try {
        // Generar datos del algoritmo
        const algorithmData = await generateAlgorithmJSON(activityId, teamSize, minTeams, maxTeams, customConstraints);
        
        if (!algorithmData) {
            console.error(`❌ [AlgorithmFunctions] No se pudieron generar los datos del algoritmo`);
            return null;
        }

        // Guardar archivo
        const filePath = await saveAlgorithmJSON(activityId, algorithmData);
        
        if (!filePath) {
            console.error(`❌ [AlgorithmFunctions] No se pudo guardar el archivo del algoritmo`);
            return null;
        }

        console.log(`🎉 [AlgorithmFunctions] ÉXITO - Archivo del algoritmo creado: ${filePath}`);
        return filePath;

    } catch (error: any) {
        console.error(`💥 [AlgorithmFunctions] ERROR CRÍTICO creando archivo de algoritmo:`, error);
        return null;
    }
};

/**
 * Verifica si existe el archivo JSON para una actividad
 * @param activityId ID de la actividad
 * @returns boolean true si el archivo existe
 */
export const algorithmFileExists = (activityId: string): boolean => {
    const filePath = getAlgorithmFilePath(activityId);
    return fs.existsSync(filePath);
};

/**
 * Elimina el archivo JSON del algoritmo para una actividad
 * @param activityId ID de la actividad
 * @returns boolean true si se eliminó exitosamente
 */
export const deleteAlgorithmFile = (activityId: string): boolean => {
    try {
        const filePath = getAlgorithmFilePath(activityId);
        
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log(`🗑️ [AlgorithmFunctions] Archivo eliminado: ${filePath}`);
            return true;
        }
        
        console.log(`⚠️ [AlgorithmFunctions] Archivo no encontrado para eliminar: ${filePath}`);
        return true; // No es error si no existe

    } catch (error: any) {
        console.error(`💥 [AlgorithmFunctions] Error eliminando archivo:`, error);
        return false;
    }
};

export { AlgorithmData, AlgorithmMember, AlgorithmConstraint };

/**
 * Regenera automáticamente el archivo JSON cuando cambian los parámetros del algoritmo
 * Esta función es llamada automáticamente cuando se actualiza la configuración
 * CORREGIDO: Usa SIEMPRE los parámetros del profesor
 * @param activityId ID de la actividad
 * @param newConfig Nueva configuración del algoritmo del profesor
 * @returns Promise<boolean> true si se regeneró exitosamente
 */
export const regenerateAlgorithmFileOnConfigChange = async (
    activityId: string,
    newConfig: any
): Promise<boolean> => {
    console.log(`🔄 [AlgorithmRegenerate] Regenerando archivo para actividad: ${activityId}`);
    console.log(`📋 [AlgorithmRegenerate] Nueva configuración del profesor:`, newConfig);

    try {
        // Verificar si al menos algunos estudiantes han completado BELBIN
        const hasMinimumBelbin = await validateMinimumStudentsWithBelbin(activityId);
        
        if (!hasMinimumBelbin) {
            console.log(`⏳ [AlgorithmRegenerate] No hay estudiantes con BELBIN completado - No se regenera archivo`);
            return false;
        }

        // Validar que tenemos todos los parámetros necesarios del profesor
        if (!newConfig.teamSize || !newConfig.minTeams || !newConfig.maxTeams) {
            console.log(`❌ [AlgorithmRegenerate] Faltan parámetros obligatorios del profesor`);
            console.log(`📊 [AlgorithmRegenerate] Recibido: teamSize=${newConfig.teamSize}, minTeams=${newConfig.minTeams}, maxTeams=${newConfig.maxTeams}`);
            return false;
        }

        // Eliminar archivo anterior si existe
        if (algorithmFileExists(activityId)) {
            const deleted = deleteAlgorithmFile(activityId);
            if (deleted) {
                console.log(`🗑️ [AlgorithmRegenerate] Archivo anterior eliminado`);
            }
        }

        // Crear nuevo archivo con la configuración exacta del profesor
        const filePath = await createAlgorithmFileForActivity(
            activityId,
            newConfig.teamSize,
            newConfig.minTeams,
            newConfig.maxTeams,
            newConfig.additionalConstraints || []
        );

        if (filePath) {
            console.log(`✅ [AlgorithmRegenerate] Archivo regenerado exitosamente: ${filePath}`);
            console.log(`🎯 [AlgorithmRegenerate] Parámetros del profesor aplicados: ${newConfig.teamSize} por equipo, ${newConfig.minTeams}-${newConfig.maxTeams} equipos`);
            return true;
        } else {
            console.log(`❌ [AlgorithmRegenerate] No se pudo regenerar el archivo`);
            return false;
        }

    } catch (error: any) {
        console.error(`💥 [AlgorithmRegenerate] Error regenerando archivo:`, error);
        return false;
    }
};

/**
 * Sistema de validación completa para determinar si una actividad está lista para ejecutar el algoritmo
 * @param activityId ID de la actividad
 * @returns Promise<ValidationResult> Resultado detallado de la validación
 */
export interface ValidationResult {
    isValid: boolean;
    canExecuteAlgorithm: boolean;
    validations: {
        hasStudents: { valid: boolean; message: string; details?: any };
        isConfigured: { valid: boolean; message: string; details?: any };
        allBelbinCompleted: { valid: boolean; message: string; details?: any };
        fileExists: { valid: boolean; message: string; details?: any };
        noConflicts: { valid: boolean; message: string; details?: any };
    };
    summary: {
        totalStudents: number;
        completedBelbin: number;
        teamSize: number | null;
        minTeams: number | null;
        maxTeams: number | null;
        algorithmStatus: string;
        configuredAt: string | null;
    };
    recommendations: string[];
}

export const performCompleteValidation = async (activityId: string): Promise<ValidationResult> => {
    console.log(`🔍 [CompleteValidation] Iniciando validación completa para actividad: ${activityId}`);

    try {
        // Obtener información de la actividad
        const activity = await collections.activities?.findOne({ _id: new ObjectId(activityId) });
        
        if (!activity) {
            throw new Error(`Actividad ${activityId} no encontrada`);
        }

        const totalStudents = activity.students?.length || 0;
        const algorithmConfig = activity.algorithmConfig;
        const isConfigured = algorithmConfig?.isConfigured || false;
        const teamSize = algorithmConfig?.teamSize || null;

        // Validar estudiantes
        const hasStudents = totalStudents > 0;
        
        // Validar BELBIN
        const allCompleted = await validateAllStudentsCompletedBelbin(activityId);
        const studentsWithBelbin = await collections.users?.find({
            _id: { $in: activity.students || [] },
            "askedQuestionnaires": {
                $elemMatch: {
                    "result": { $in: BELBIN_TRAITS }
                }
            }
        }).toArray();
        const completedBelbin = studentsWithBelbin?.length || 0;

        // Validar archivo JSON
        const fileExists = algorithmFileExists(activityId);

        // Validar conflictos de configuración
        let configConflicts: string[] = [];
        if (isConfigured && teamSize) {
            if (teamSize > totalStudents) {
                configConflicts.push(`Tamaño de equipo (${teamSize}) mayor que total de estudiantes (${totalStudents})`);
            }
            if (teamSize < 2) {
                configConflicts.push(`Tamaño de equipo debe ser al menos 2`);
            }
        }

        // Construir resultado de validaciones
        const validations = {
            hasStudents: {
                valid: hasStudents,
                message: hasStudents ? 
                    `${totalStudents} estudiantes asignados` : 
                    "No hay estudiantes asignados a la actividad",
                details: { totalStudents }
            },
            isConfigured: {
                valid: isConfigured,
                message: isConfigured ? 
                    "Algoritmo configurado correctamente" : 
                    "Algoritmo no configurado",
                details: { 
                    teamSize,
                    configuredAt: algorithmConfig?.lastConfiguredAt?.toISOString() || null
                }
            },
            allBelbinCompleted: {
                valid: allCompleted,
                message: allCompleted ? 
                    "Todos los estudiantes han completado el test BELBIN" : 
                    `${completedBelbin}/${totalStudents} estudiantes han completado BELBIN`,
                details: { 
                    completedCount: completedBelbin,
                    totalCount: totalStudents,
                    completionPercentage: totalStudents > 0 ? Math.round((completedBelbin / totalStudents) * 100) : 0
                }
            },
            fileExists: {
                valid: fileExists,
                message: fileExists ? 
                    "Archivo JSON del algoritmo disponible" : 
                    "Archivo JSON del algoritmo no generado",
                details: { 
                    fileName: fileExists ? generateAlgorithmFileName(activityId) : null,
                    needsRegeneration: isConfigured && allCompleted && !fileExists
                }
            },
            noConflicts: {
                valid: configConflicts.length === 0,
                message: configConflicts.length === 0 ? 
                    "Configuración sin conflictos" : 
                    `Conflictos encontrados: ${configConflicts.join(', ')}`,
                details: { conflicts: configConflicts }
            }
        };

        // Determinar si se puede ejecutar el algoritmo
        const allValid = Object.values(validations).every(v => v.valid);

        // Generar recomendaciones
        const recommendations: string[] = [];
        if (!hasStudents) {
            recommendations.push("Asignar estudiantes a la actividad");
        }
        if (!isConfigured) {
            recommendations.push("Configurar parámetros del algoritmo (tamaño de equipos)");
        }
        if (!allCompleted) {
            recommendations.push(`${totalStudents - completedBelbin} estudiantes necesitan completar el test BELBIN`);
        }
        if (isConfigured && allCompleted && !fileExists) {
            recommendations.push("Regenerar archivo JSON del algoritmo");
        }
        if (configConflicts.length > 0) {
            recommendations.push("Corregir conflictos en la configuración");
        }

        const result: ValidationResult = {
            isValid: allValid,
            canExecuteAlgorithm: allValid,
            validations,
            summary: {
                totalStudents,
                completedBelbin,
                teamSize,
                minTeams: algorithmConfig?.minTeams || null,
                maxTeams: algorithmConfig?.maxTeams || null,
                algorithmStatus: activity.algorithmStatus || 'not-configured',
                configuredAt: algorithmConfig?.lastConfiguredAt?.toISOString() || null
            },
            recommendations
        };

        console.log(`✅ [CompleteValidation] Validación completada para actividad: ${activityId}`);
        console.log(`📊 [CompleteValidation] Resultado: ${allValid ? 'VÁLIDO' : 'INVÁLIDO'} - ${recommendations.length} recomendaciones`);

        return result;

    } catch (error: any) {
        console.error(`💥 [CompleteValidation] Error en validación:`, error);
        throw error;
    }
};

/**
 * Función de escucha de cambios que actualiza automáticamente archivos JSON
 * cuando un estudiante completa BELBIN o se cambia la configuración
 * @param activityId ID de la actividad
 * @param changeType Tipo de cambio: 'student-belbin' | 'config-update' | 'student-added'
 * @param details Detalles adicionales del cambio
 */
export const handleActivityChange = async (
    activityId: string,
    changeType: 'student-belbin' | 'config-update' | 'student-added',
    details?: any
): Promise<void> => {
    console.log(`🔔 [ActivityChangeListener] Cambio detectado en actividad: ${activityId}`);
    console.log(`📝 [ActivityChangeListener] Tipo de cambio: ${changeType}`);
    console.log(`📋 [ActivityChangeListener] Detalles:`, details);

    try {
        // Obtener configuración actual de la actividad
        const activity = await collections.activities?.findOne({ _id: new ObjectId(activityId) });
        
        if (!activity || !activity.algorithmConfig?.isConfigured) {
            console.log(`⏭️ [ActivityChangeListener] Actividad no configurada - Omitiendo cambio`);
            return;
        }

        const algorithmConfig = activity.algorithmConfig;

        switch (changeType) {
            case 'student-belbin':
                console.log(`👨‍🎓 [ActivityChangeListener] Estudiante completó BELBIN - Verificando si regenerar archivo...`);
                
                // Verificar si hay suficientes estudiantes con BELBIN para regenerar
                const hasMinimumBelbin = await validateMinimumStudentsWithBelbin(activityId);
                
                if (hasMinimumBelbin) {
                    console.log(`✅ [ActivityChangeListener] Suficientes estudiantes con BELBIN - Regenerando archivo`);
                    await regenerateAlgorithmFileOnConfigChange(activityId, algorithmConfig);
                    
                    // Actualizar estado de la actividad a 'ready'
                    await collections.activities?.updateOne(
                        { _id: new ObjectId(activityId) },
                        { 
                            $set: { 
                                algorithmStatus: 'ready',
                                updatedAt: new Date()
                            } 
                        }
                    );
                } else {
                    console.log(`⏳ [ActivityChangeListener] Aún faltan estudiantes por completar BELBIN`);
                }
                break;

            case 'config-update':
                console.log(`⚙️ [ActivityChangeListener] Configuración actualizada - Regenerando archivo`);
                await regenerateAlgorithmFileOnConfigChange(activityId, details?.newConfig || algorithmConfig);
                break;

            case 'student-added':
                console.log(`👥 [ActivityChangeListener] Estudiante añadido - Verificando estado`);
                
                // Si el archivo existe, puede necesitar regeneración con los nuevos estudiantes
                if (algorithmFileExists(activityId)) {
                    const hasMinimumBelbin = await validateMinimumStudentsWithBelbin(activityId);
                    
                    if (hasMinimumBelbin) {
                        console.log(`🔄 [ActivityChangeListener] Regenerando archivo con nuevo estudiante`);
                        await regenerateAlgorithmFileOnConfigChange(activityId, algorithmConfig);
                    } else {
                        console.log(`⏳ [ActivityChangeListener] Nuevo estudiante necesita completar BELBIN`);
                        
                        // Cambiar estado a 'configured' porque ya no está 'ready'
                        await collections.activities?.updateOne(
                            { _id: new ObjectId(activityId) },
                            { 
                                $set: { 
                                    algorithmStatus: 'configured',
                                    updatedAt: new Date()
                                } 
                            }
                        );
                    }
                }
                break;

            default:
                console.log(`⚠️ [ActivityChangeListener] Tipo de cambio no reconocido: ${changeType}`);
        }

        console.log(`✅ [ActivityChangeListener] Cambio procesado exitosamente para actividad: ${activityId}`);

    } catch (error: any) {
        console.error(`💥 [ActivityChangeListener] Error procesando cambio:`, error);
    }
}; 