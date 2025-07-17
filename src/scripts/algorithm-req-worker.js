/**
 * Worker CORREGIDO para ejecutar el algoritmo de formación de equipos
 * Compatible con la estructura de datos real del backend
 */

const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 [AlgorithmWorker] Worker iniciado con datos:', workerData);

async function runAlgorithm() {
    try {
        // CORREGIDO: Usar estructura real de datos que envía el backend
        const { 
            activityId, 
            teamSize,           // ✅ teamSize viene directamente
            constraintsCount, 
            studentsCount, 
            orderedStudentIds 
        } = workerData;

        console.log(`🔄 [AlgorithmWorker] Iniciando algoritmo para actividad: ${activityId}`);
        console.log(`📊 [AlgorithmWorker] Parámetros: teamSize=${teamSize}, constraints=${constraintsCount || 0}`);
        console.log(`📊 [AlgorithmWorker] Estudiantes: ${studentsCount}, ordenados: ${orderedStudentIds?.length || 0}`);

        // 1. Buscar archivo JSON generado
        const jsonFilePath = `/home/gti/teamlens/pyteamformation/instances/activity_${activityId}_belbin.json`;
        
        if (!fs.existsSync(jsonFilePath)) {
            throw new Error(`Archivo JSON no encontrado: ${jsonFilePath}`);
        }

        console.log(`📁 [AlgorithmWorker] Archivo JSON encontrado: ${jsonFilePath}`);

        // 2. Leer datos del algoritmo desde el archivo JSON
        const algorithmData = JSON.parse(fs.readFileSync(jsonFilePath, 'utf8'));
        console.log(`📊 [AlgorithmWorker] Datos cargados: ${algorithmData.number_members} miembros`);

        // 3. Preparar datos para Python
        const pythonAlgorithmData = {
            number_members: algorithmData.number_members,
            members: algorithmData.members,
            constraints: algorithmData.constraints,
            problem_type: algorithmData.problem_type || 'TraitTeamFormation',
            agg_func: algorithmData.agg_func || 'sum',
            traits: algorithmData.traits || ['TW', 'CW', 'CH', 'ME', 'CF', 'SH', 'PL', 'RI']
        };

        // 4. Ejecutar script Python
        const pythonScript = path.join(__dirname, 'algorithm.py');
        
        if (!fs.existsSync(pythonScript)) {
            throw new Error(`Script Python no encontrado: ${pythonScript}`);
        }

        console.log(`🐍 [AlgorithmWorker] Ejecutando Python: ${pythonScript}`);
        console.log(`📊 [AlgorithmWorker] Datos JSON: ${JSON.stringify(pythonAlgorithmData).substring(0, 200)}...`);

        const pythonProcess = spawn('python3', [pythonScript, JSON.stringify(pythonAlgorithmData)]);

        let pythonOutput = '';
        let pythonError = '';

        pythonProcess.stdout.on('data', (data) => {
            pythonOutput += data.toString();
        });

        pythonProcess.stderr.on('data', (data) => {
            pythonError += data.toString();
        });

        // 5. Esperar resultado de Python
        await new Promise((resolve, reject) => {
            pythonProcess.on('close', (code) => {
                if (code !== 0) {
                    console.log(`💥 [AlgorithmWorker] Python falló con código: ${code}`);
                    console.log(`💥 [AlgorithmWorker] Error: ${pythonError}`);
                    reject(new Error(`Python execution failed with code ${code}: ${pythonError}`));
                } else {
                    resolve();
                }
            });
        });

        console.log(`✅ [AlgorithmWorker] Python ejecutado exitosamente`);
        console.log(`📊 [AlgorithmWorker] Output: ${pythonOutput.substring(0, 500)}...`);

        // 6. Procesar resultado de Python
        let teams;
        try {
            // El output de Python debería ser un array de arrays
            teams = JSON.parse(pythonOutput.trim());
            console.log(`📊 [AlgorithmWorker] Teams parseados: ${teams.length} equipos`);
        } catch (e) {
            console.log(`⚠️ [AlgorithmWorker] Error parseando output, usando formato raw`);
            teams = pythonOutput.trim();
        }

        // 7. CORREGIDO: Mapear índices a IDs reales usando orderedStudentIds
        const studentIds = orderedStudentIds || [];
        console.log(`🔗 [AlgorithmWorker] IDs disponibles: ${studentIds.length}`);

        let result;
        if (Array.isArray(teams) && Array.isArray(teams[0])) {
            // Mapear índices a IDs reales
            result = teams.map(team => 
                team.map(index => {
                    if (typeof index === 'number' && index >= 0 && index < studentIds.length) {
                        return studentIds[index];
                    }
                    return null; // Para índices inválidos
                }).filter(id => id !== null)
            );
            console.log(`🎯 [AlgorithmWorker] Resultado mapeado: ${result.length} equipos con IDs reales`);
        } else {
            result = teams;
            console.log(`⚠️ [AlgorithmWorker] Resultado sin mapear (formato inesperado)`);
        }

        // 8. Enviar resultado
        const response = {
            success: true,
            teams: result,
            studentsProcessed: studentsCount,
            teamsCreated: Array.isArray(result) ? result.length : 0,
            executionTime: new Date().toISOString()
        };

        console.log(`✅ [AlgorithmWorker] Enviando respuesta exitosa: ${response.teamsCreated} equipos`);
        
        if (parentPort) {
            parentPort.postMessage(response);
        }

    } catch (error) {
        console.log(`💥 [AlgorithmWorker] Error:`, error);
        
        const errorResponse = {
            success: false,
            error: error.message,
            details: error.stack
        };

        if (parentPort) {
            parentPort.postMessage(errorResponse);
        }
    }
}

// Ejecutar solo si no es el hilo principal
if (!isMainThread) {
    runAlgorithm();
}