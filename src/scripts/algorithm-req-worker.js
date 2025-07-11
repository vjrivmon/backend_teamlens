/**
 * Worker dinámico para ejecutar el algoritmo de formación de equipos
 * Utiliza archivos JSON específicos de actividad generados automáticamente
 */

const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { MongoClient, ObjectId } = require('mongodb');

console.log('🚀 [AlgorithmWorker] Worker iniciado con datos:', workerData);

async function runAlgorithm() {
    const { activityId, teamSize, customConstraints, orderedStudentIds } = workerData;
    
    try {
        console.log(`🎯 [AlgorithmWorker] Ejecutando algoritmo para actividad: ${activityId}`);
        console.log(`📊 [AlgorithmWorker] Parámetros: teamSize=${teamSize}, constraints=${customConstraints?.length || 0}`);
        console.log(`📊 [AlgorithmWorker] Estudiantes ordenados: ${orderedStudentIds?.length || 0}`);
        
        // 1. Verificar que existe el archivo JSON
        const jsonFileName = `activity_${activityId}_belbin.json`;
        const jsonFilePath = path.join(__dirname, '../../../pyteamformation/instances', jsonFileName);
        
        if (!fs.existsSync(jsonFilePath)) {
            throw new Error(`Archivo JSON no encontrado: ${jsonFileName}`);
        }
        
        console.log(`📄 [AlgorithmWorker] Archivo JSON encontrado: ${jsonFileName}`);
        
        // 2. Leer el archivo JSON
        const jsonContent = fs.readFileSync(jsonFilePath, 'utf8');
        const algorithmData = JSON.parse(jsonContent);
        
        console.log(`📋 [AlgorithmWorker] Datos del algoritmo cargados:`);
        console.log(`   - Total miembros: ${algorithmData.members?.length || 0}`);
        console.log(`   - Tamaño equipo: ${algorithmData.constraints?.find(c => c.type === 'SizeCardinality')?.team_size || 'no especificado'}`);
        console.log(`   - Constraints: ${algorithmData.constraints?.length || 0}`);
        
        // 3. CORREGIDO: Usar los IDs ordenados enviados desde el backend
        let studentIds;
        
        if (orderedStudentIds && orderedStudentIds.length > 0) {
            // Usar el orden exacto enviado desde el backend
            studentIds = orderedStudentIds;
            console.log(`✅ [AlgorithmWorker] Usando orden de estudiantes del backend: ${studentIds.length}`);
            
            // Verificar que coincide con el número de miembros en el JSON
            if (studentIds.length !== algorithmData.number_members) {
                throw new Error(`Desajuste: JSON tiene ${algorithmData.number_members} miembros, backend envió ${studentIds.length} IDs`);
            }
        } else {
            // Fallback: obtener de la base de datos (método anterior)
            console.log(`⚠️ [AlgorithmWorker] No se recibieron IDs ordenados, obteniendo de la base de datos...`);
            
            const client = new MongoClient('mongodb://localhost:27017');
            await client.connect();
            const db = client.db('test');
            
            const activity = await db.collection('activities').findOne({ 
                _id: new ObjectId(activityId) 
            });
            
            if (!activity || !activity.students) {
                throw new Error('Actividad no encontrada o sin estudiantes');
            }
            
            const allStudents = await db.collection('users').find({
                _id: { $in: activity.students },
                "askedQuestionnaires": {
                    $elemMatch: {
                        "result": { $in: ["TW", "CW", "CH", "ME", "CF", "SH", "PL", "RI"] }
                    }
                }
            }).toArray();
            
            studentIds = allStudents.slice(0, algorithmData.number_members).map(student => student._id.toString());
            await client.close();
        }
        
        console.log(`👥 [AlgorithmWorker] Estudiantes finales mapeados: ${studentIds.length}`);
        console.log(`📧 [AlgorithmWorker] IDs de estudiantes en orden:`);
        studentIds.forEach((id, index) => {
            console.log(`   Índice ${index}: ${id}`);
        });
        
        // 3.5. NUEVO: Procesar restricciones customConstraints del frontend
        if (customConstraints && customConstraints.length > 0) {
            console.log(`🔧 [AlgorithmWorker] Procesando ${customConstraints.length} restricciones personalizadas...`);
            
            customConstraints.forEach((constraint, index) => {
                console.log(`   🔍 Restricción ${index}: ${constraint.type} con ${constraint.members?.length || 0} miembros`);
                
                if (constraint.members && constraint.members.length >= 2) {
                    // Convertir IDs de MongoDB a índices
                    const memberIndices = constraint.members.map(memberId => {
                        const index = studentIds.indexOf(memberId.toString());
                        console.log(`     ID ${memberId} -> Índice ${index}`);
                        return index;
                    }).filter(index => index !== -1);
                    
                    if (memberIndices.length >= 2) {
                        // Actualizar la restricción en el algorithmData con índices
                        const constraintToAdd = {
                            type: constraint.type,
                            name: constraint.name || "",
                            members: memberIndices
                        };
                        
                        algorithmData.constraints.push(constraintToAdd);
                        console.log(`   ✅ Restricción ${constraint.type} añadida: índices [${memberIndices.join(', ')}]`);
                    } else {
                        console.log(`   ⚠️ Restricción ${constraint.type} ignorada - no suficientes miembros válidos`);
                    }
                } else {
                    console.log(`   ⚠️ Restricción ${constraint.type} ignorada - menos de 2 miembros`);
                }
            });
            
            console.log(`✅ [AlgorithmWorker] Total constraints después de procesar: ${algorithmData.constraints.length}`);
        } else {
            console.log(`ℹ️ [AlgorithmWorker] No hay restricciones personalizadas para procesar`);
        }
        
        // 4. Ejecutar el script Python
        console.log(`🐍 [AlgorithmWorker] Ejecutando script Python...`);
        
        const pythonScript = path.join(__dirname, 'algorithm.py');
        if (!fs.existsSync(pythonScript)) {
            throw new Error(`Script Python no encontrado: ${pythonScript}`);
        }
        
        const pythonProcess = spawn('python', [pythonScript, JSON.stringify(algorithmData)]);
        
        let stdout = '';
        let stderr = '';
        
        pythonProcess.stdout.on('data', (data) => {
            stdout += data.toString();
        });
        
        pythonProcess.stderr.on('data', (data) => {
            const message = data.toString();
            stderr += message;
            console.log(`🐍 [Python] ${message.trim()}`);
        });
        
        // 5. Esperar a que termine el proceso Python
        const exitCode = await new Promise((resolve) => {
            pythonProcess.on('close', resolve);
        });
        
        if (exitCode !== 0) {
            throw new Error(`Script Python falló con código ${exitCode}. Error: ${stderr}`);
        }
        
        console.log(`✅ [AlgorithmWorker] Script Python completado exitosamente`);
        
        // 6. CORREGIDO: Procesar resultado - convertir índices a IDs reales
        const teamIndices = JSON.parse(stdout.trim());
        console.log(`📊 [AlgorithmWorker] Equipos recibidos del Python: ${teamIndices.length}`);
        
        // Convertir índices a IDs reales de estudiantes
        const teamsWithRealIds = teamIndices.map((teamIndices, teamIndex) => {
            const teamIds = teamIndices.map(index => {
                if (index >= 0 && index < studentIds.length) {
                    return studentIds[index];
                } else {
                    console.warn(`⚠️ [AlgorithmWorker] Índice inválido: ${index} (máximo: ${studentIds.length - 1})`);
                    return null;
                }
            }).filter(id => id !== null);
            
            console.log(`👥 [AlgorithmWorker] Equipo ${teamIndex + 1}: ${teamIds.length} miembros`);
            return teamIds;
        });
        
        console.log(`🎉 [AlgorithmWorker] Resultado final: ${teamsWithRealIds.length} equipos con IDs reales`);
        
        // 7. Enviar resultado exitoso al hilo principal
        if (parentPort) {
            parentPort.postMessage({
                success: true,
                result: JSON.stringify(teamsWithRealIds),
                teamsCount: teamsWithRealIds.length,
                studentsProcessed: studentIds.length,
                executionTime: Date.now()
            });
        }
        
    } catch (error) {
        console.error(`💥 [AlgorithmWorker] Error ejecutando algoritmo:`, error);
        
        if (parentPort) {
            parentPort.postMessage({
                success: false,
                error: error.message,
                details: {
                    activityId: activityId,
                    errorType: error.constructor.name,
                    stack: error.stack
                }
            });
        }
    }
}

// Ejecutar si estamos en el worker thread
if (!isMainThread && parentPort) {
    console.log(`🔄 [AlgorithmWorker] Iniciando ejecución del algoritmo...`);
    runAlgorithm();
}