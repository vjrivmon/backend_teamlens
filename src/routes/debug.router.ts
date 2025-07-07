import { Request, Response, Router } from "express";
import { ObjectId } from "mongodb";
import { collections } from "../services/database.service";

export const debugRouter = Router();

/**
 * Endpoint de debug sin autenticación para testing del sistema corregido
 * SOLO PARA DESARROLLO - NO USAR EN PRODUCCIÓN
 */
debugRouter.post("/activities/:id/algorithm/test", async (req: Request, res: Response) => {
    const activityId = req?.params?.id;
    const frontendData = req.body; 

    console.log(`🧪 [Debug] ==========================================`);
    console.log(`🧪 [Debug] TESTING SISTEMA CORREGIDO SIN AUTH`);
    console.log(`🧪 [Debug] Actividad: ${activityId}`);
    console.log(`🧪 [Debug] Datos del frontend:`, frontendData);
    console.log(`🧪 [Debug] ==========================================`);

    try {
        // 1. Verificar actividad
        const activity = await collections.activities?.findOne({ _id: new ObjectId(activityId) });
        if (!activity) {
            return res.status(404).send({ message: "Activity not found" });
        }

        // 2. Procesar igual que el endpoint principal
        const { algorithmData, selectedStudentIds, groupConfigurations, restrictions } = frontendData;
        
        if (!algorithmData || !selectedStudentIds) {
            return res.status(400).send({
                message: "No algorithm data or selected students received from frontend"
            });
        }

        console.log(`✅ [Debug] Datos recibidos: ${selectedStudentIds.length} estudiantes seleccionados`);

        // 3. Obtener estudiantes con BELBIN usando los IDs seleccionados
        const selectedStudents = await collections.users?.find({
            _id: { $in: selectedStudentIds.map((id: string) => new ObjectId(id)) }
        }).toArray();

        if (!selectedStudents || selectedStudents.length === 0) {
            return res.status(400).send({ message: "Selected students not found" });
        }

        // 4. Obtener traits BELBIN de los estudiantes seleccionados
        const belbinQuestionnaireId = "6718b2263e29ad19c0e0c61f";
        const membersWithTraits = selectedStudents.map(student => {
            const belbinQuestionnaire = student.askedQuestionnaires?.find(aq => 
                aq.questionnaire.toString() === belbinQuestionnaireId && aq.result
            );

            const primaryTrait = belbinQuestionnaire?.result || "";
            const traits = primaryTrait ? [primaryTrait] : [];

            console.log(`📝 [Debug] Estudiante ${student.email}: traits=${traits.join(', ')}`);

            return { traits: traits };
        });

        // 5. Construir algorithmData correcto
        const processedAlgorithmData = { 
            ...algorithmData,
            number_members: membersWithTraits.length,
            members: membersWithTraits
        };
        
        console.log(`✅ [Debug] AlgorithmData corregido:`);
        console.log(`📊 [Debug] - Miembros: ${processedAlgorithmData.number_members}`);
        console.log(`📊 [Debug] - Traits obtenidos: ${membersWithTraits.length}`);

        // 6. Procesar restricciones si las hay
        if (restrictions?.mustNotBeTogether?.length > 0) {
            const studentIdToIndex = new Map();
            selectedStudents.forEach((student, index) => {
                studentIdToIndex.set(student._id.toString(), index);
            });

            restrictions.mustNotBeTogether.forEach((restriction: any[], restrictionIndex: number) => {
                const memberIndices = restriction
                    .map(userId => studentIdToIndex.get(userId))
                    .filter(index => index !== undefined);

                if (memberIndices.length >= 2) {
                    for (let i = 0; i < memberIndices.length; i++) {
                        for (let j = i + 1; j < memberIndices.length; j++) {
                            processedAlgorithmData.constraints.push({
                                type: "DifferentTeam",
                                name: `debug_must_not_${restrictionIndex}_${i}_${j}`,
                                members: [memberIndices[i], memberIndices[j]]
                            });
                        }
                    }
                    console.log(`✅ [Debug] Añadidas restricciones DifferentTeam`);
                }
            });
        }

        // 7. Generar archivo JSON
        const { saveAlgorithmJSON } = await import("../functions/algorithm-functions");
        const filePath = await saveAlgorithmJSON(activityId, processedAlgorithmData);
        
        if (!filePath) {
            return res.status(500).send({ message: "Failed to generate JSON file" });
        }

        console.log(`✅ [Debug] Archivo JSON generado: ${filePath}`);
        
        return res.status(200).send({
            success: true,
            message: 'Debug test completed successfully',
            data: {
                activityId: activityId,
                studentsProcessed: membersWithTraits.length,
                constraintsGenerated: processedAlgorithmData.constraints.length,
                traitsFound: membersWithTraits.filter(m => m.traits.length > 0).length,
                jsonFileGenerated: !!filePath,
                filePath: filePath,
                systemInfo: {
                    debugMode: true,
                    dataSource: 'frontend_corrected_system'
                }
            }
        });

    } catch (error: any) {
        console.error(`💥 [Debug] Error:`, error);
        return res.status(500).send({
            success: false,
            message: "Debug test failed",
            error: error.message
        });
    }
});

export default debugRouter; 