const { parentPort, workerData } = require('worker_threads');
const { exec } = require('child_process');

const path = require('path');

const jsonString = JSON.stringify(workerData.algorithmData).replace(/"/g, '\\"');

console.log(`Datos en formato JSON: ${jsonString}`);

const scriptPath = path.join(__dirname, 'algorithm.py');
const command = `py "${scriptPath}" ${jsonString}`;

// console.log(`Comando a ejecutar: ${command}`);

exec(command, (error, stdout, stderr) => {
    
    if (error) {
        console.error(`Error ejecutando el script: ${error.message}`);
        return;
    }
    if (stderr) {
        console.error(`Error en el script: ${stderr}`);
        return;
    }

    parentPort.postMessage(stdout);

});