/**
 * Worker dinámico para ejecutar el algoritmo de formación de equipos
 * Utiliza archivos JSON específicos de actividad generados automáticamente
 */

const { parentPort, workerData } = require('worker_threads');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log(`🚀 [AlgorithmWorker] Worker iniciado para actividad: ${workerData.activityId}`);

/**
 * Ejecuta el algoritmo de formación de equipos usando el archivo JSON dinámico
 */
async function runAlgorithm() {
    try {
        const { activityId, teamSize, customConstraints = [] } = workerData;
        
        if (!activityId) {
            throw new Error('ActivityId es requerido');
        }

        console.log(`📋 [AlgorithmWorker] Parámetros recibidos:`, {
            activityId,
            teamSize,
            constraintsCount: customConstraints.length
        });

        // Generar el nombre del archivo JSON dinámico
        const jsonFileName = `activity_${activityId}_belbin.json`;
        const pyteamformationPath = path.join(__dirname, '../../../pyteamformation');
        const jsonFilePath = path.join(pyteamformationPath, 'instances', jsonFileName);

        console.log(`📁 [AlgorithmWorker] Buscando archivo JSON: ${jsonFilePath}`);

        // Verificar que el archivo JSON existe
        if (!fs.existsSync(jsonFilePath)) {
            throw new Error(`Archivo JSON no encontrado: ${jsonFileName}. El archivo debe generarse antes de ejecutar el algoritmo.`);
        }

        console.log(`✅ [AlgorithmWorker] Archivo JSON encontrado: ${jsonFileName}`);

        // Configurar el comando para ejecutar el script Python dinámico
        const pythonScriptPath = path.join(pyteamformationPath, 'equipos_lola.py');
        const command = `python "${pythonScriptPath}" "${jsonFileName}"`;

        console.log(`🐍 [AlgorithmWorker] Ejecutando comando: ${command}`);
        console.log(`📂 [AlgorithmWorker] Directorio de trabajo: ${pyteamformationPath}`);

        // Configurar opciones del proceso
        const execOptions = {
            cwd: pyteamformationPath,
            timeout: 300000, // 5 minutos timeout
            maxBuffer: 1024 * 1024 * 10 // 10MB buffer
        };

        // Ejecutar el algoritmo
        exec(command, execOptions, (error, stdout, stderr) => {
            if (error) {
                console.error(`💥 [AlgorithmWorker] Error ejecutando algoritmo: ${error.message}`);
                console.error(`📋 [AlgorithmWorker] Código de error: ${error.code}`);
                console.error(`🔍 [AlgorithmWorker] Señal: ${error.signal}`);
                
                parentPort.postMessage({
                    success: false,
                    error: error.message,
                    errorCode: error.code,
                    stderr: stderr
                });
                return;
            }

            // Log de información del proceso (stderr contiene logs del script Python)
            if (stderr) {
                console.log(`📊 [AlgorithmWorker] Logs del algoritmo:`);
                console.log(stderr);
            }

            // Verificar que tenemos output
            if (!stdout || stdout.trim() === '') {
                console.error(`⚠️ [AlgorithmWorker] El algoritmo no devolvió resultados`);
                parentPort.postMessage({
                    success: false,
                    error: 'El algoritmo no devolvió resultados válidos',
                    stderr: stderr
                });
                return;
            }

            try {
                // El output del algoritmo debería ser la solución en formato JSON
                console.log(`📈 [AlgorithmWorker] Resultado crudo del algoritmo:`);
                console.log(stdout);
                
                // El algoritmo retorna la solución directamente
                // La solución ya está en el formato correcto para crear grupos
                const algorithmResult = stdout.trim();
                
                console.log(`✅ [AlgorithmWorker] Algoritmo ejecutado exitosamente`);
                console.log(`📊 [AlgorithmWorker] Resultado procesado:`, algorithmResult);

                // Enviar resultado exitoso al proceso principal
                parentPort.postMessage({
                    success: true,
                    result: algorithmResult,
                    activityId: activityId,
                    jsonFileName: jsonFileName,
                    executionTime: new Date().toISOString()
                });

            } catch (parseError) {
                console.error(`💥 [AlgorithmWorker] Error procesando resultado del algoritmo:`, parseError);
                console.error(`📄 [AlgorithmWorker] Output crudo:`, stdout);
                
                parentPort.postMessage({
                    success: false,
                    error: `Error procesando resultado: ${parseError.message}`,
                    rawOutput: stdout,
                    stderr: stderr
                });
            }
        });

    } catch (error) {
        console.error(`💥 [AlgorithmWorker] Error crítico en worker:`, error);
        parentPort.postMessage({
            success: false,
            error: error.message,
            criticalError: true
        });
    }
}

// Ejecutar el algoritmo
runAlgorithm();