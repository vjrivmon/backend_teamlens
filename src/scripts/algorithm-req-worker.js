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
    const { activityId, teamSize, customConstraints } = workerData;
    
    try {
        console.log(`🎯 [AlgorithmWorker] Ejecutando algoritmo para actividad: ${activityId}`);
        console.log(`📊 [AlgorithmWorker] Parámetros: teamSize=${teamSize}, constraints=${customConstraints?.length || 0}`);
        
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
        
        // 3. CRUCIAL: Obtener lista de IDs de estudiantes en el mismo orden que en members
        const client = new MongoClient('mongodb://localhost:27017');
        await client.connect();
        const db = client.db('test');
        
        // Obtener la actividad para conseguir los IDs de estudiantes
        const activity = await db.collection('activities').findOne({ 
            _id: new ObjectId(activityId) 
        });
        
        if (!activity || !activity.students) {
            throw new Error('Actividad no encontrada o sin estudiantes');
        }
        
        // Obtener estudiantes con BELBIN en el MISMO ORDEN que se generó el JSON
        const students = await db.collection('users').find({
            _id: { $in: activity.students },
            "askedQuestionnaires": {
                $elemMatch: {
                    "result": { $in: ["TW", "CW", "CH", "ME", "CF", "SH", "PL", "RI"] }
                }
            }
        }).toArray();
        
        // Mapear estudiantes a sus IDs en el orden correcto
        const studentIds = students.map(student => student._id.toString());
        
        console.log(`👥 [AlgorithmWorker] Estudiantes mapeados: ${studentIds.length}`);
        console.log(`📧 [AlgorithmWorker] Emails: ${students.map(s => s.email).join(', ')}`);
        
        await client.close();
        
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