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
        let algorithmResult;
        try {
            // El output de Python puede ser un objeto con teams, fitness, etc. o un array directo
            algorithmResult = JSON.parse(pythonOutput.trim());
            console.log(`📊 [AlgorithmWorker] Resultado parseado:`, typeof algorithmResult);
            
            // Extraer teams según el formato
            let teams;
            if (algorithmResult.teams && Array.isArray(algorithmResult.teams)) {
                // Nuevo formato con objeto resultado
                teams = algorithmResult.teams;
                console.log(`📊 [AlgorithmWorker] Usando formato objeto: ${teams.length} equipos`);
                console.log(`⚡ [AlgorithmWorker] Fitness: ${algorithmResult.fitness || 'N/A'}`);
                console.log(`⏱️ [AlgorithmWorker] Tiempo: ${algorithmResult.execution_time || 'N/A'}s`);
            } else if (Array.isArray(algorithmResult)) {
                // Formato legacy con array directo
                teams = algorithmResult;
                console.log(`📊 [AlgorithmWorker] Usando formato array: ${teams.length} equipos`);
            } else {
                throw new Error('Formato de resultado no reconocido');
            }
            
            // Validar que teams es válido
            if (!Array.isArray(teams) || teams.length === 0) {
                throw new Error('No se generaron equipos válidos');
            }
            
            console.log(`✅ [AlgorithmWorker] Teams extraídos correctamente: ${teams.length} equipos`);
        } catch (e) {
            console.log(`⚠️ [AlgorithmWorker] Error parseando output: ${e.message}`);
            console.log(`🔍 [AlgorithmWorker] Output raw: ${pythonOutput.substring(0, 500)}...`);
            throw new Error(`Error parseando resultado del algoritmo: ${e.message}`);
        }

        // 7. Los teams ya vienen con IDs reales desde Python, no necesitamos mapear
        console.log(`🎯 [AlgorithmWorker] Resultado final: ${teams.length} equipos con IDs reales`);
        
        // Validar que cada equipo tiene miembros válidos
        const validTeams = teams.filter(team => 
            Array.isArray(team) && team.length > 0 && 
            team.every(memberId => typeof memberId === 'string' && memberId.length > 0)
        );
        
        if (validTeams.length === 0) {
            throw new Error('No se generaron equipos válidos con IDs de miembros');
        }
        
        console.log(`✅ [AlgorithmWorker] ${validTeams.length} equipos válidos confirmados`);

        // 8. Retornar resultado
        const result = {
            teams: validTeams,
            metadata: {
                totalTeams: validTeams.length,
                fitness: algorithmResult.fitness || null,
                executionTime: algorithmResult.execution_time || null,
                totalMembers: algorithmResult.total_members || null
            }
        };

        // 9. Enviar resultado
        const response = {
            success: true,
            teams: result.teams,
            studentsProcessed: studentsCount,
            teamsCreated: result.teams.length,
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