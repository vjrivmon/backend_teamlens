/**
 * Script de verificación final - verifica que todo esté funcionando correctamente
 */

const axios = require('axios');

const ACTIVITY_ID = '686bab150b87c4e4f7f65e66';
const BASE_URL = 'http://localhost:3000';

async function finalVerification() {
    console.log('🔍 [Verification] Verificación final del sistema...');
    console.log(`📋 [Verification] Actividad: ${ACTIVITY_ID}`);
    
    try {
        // 1. Verificar estado con debug endpoint
        console.log('\n=== PASO 1: VERIFICANDO ESTADO FINAL ===');
        const debugResponse = await axios.get(`${BASE_URL}/activities/${ACTIVITY_ID}/debug-no-auth`);
        
        const debug = debugResponse.data.debug;
        console.log('📊 ESTADO ACTUAL:');
        console.log(`   🎯 Actividad: ${debug.activity.title} (${debug.activity.status})`);
        console.log(`   👥 Estudiantes: ${debug.students.withBelbin}/${debug.students.total} (${debug.students.completionPercentage}%)`);
        console.log(`   ⚙️ Configurado: ${debug.algorithmConfig.hasValidConfig}`);
        console.log(`   📄 Archivo JSON: ${debug.algorithmFile.exists}`);
        console.log(`   🐍 Python: ${debug.pythonFile.exists}`);
        console.log(`   📁 Directorio: ${debug.instancesDirectory.exists}`);
        console.log(`   🎯 Listo: ${debug.systemInfo.readyToExecute}`);

        // 2. Verificar si hay errores
        console.log('\n=== PASO 2: ANÁLISIS DE PROBLEMAS ===');
        const problems = [];
        
        if (debug.students.completionPercentage !== 100) {
            problems.push(`❌ Solo ${debug.students.completionPercentage}% han completado BELBIN`);
        }
        
        if (!debug.algorithmConfig.hasValidConfig) {
            problems.push(`❌ Algoritmo no configurado correctamente`);
        }
        
        if (!debug.algorithmFile.exists) {
            problems.push(`❌ Archivo JSON del algoritmo no existe`);
        }
        
        if (!debug.pythonFile.exists) {
            problems.push(`❌ Script Python no encontrado`);
        }
        
        if (!debug.instancesDirectory.exists) {
            problems.push(`❌ Directorio instances no existe`);
        }

        if (problems.length === 0) {
            console.log('✅ No se encontraron problemas');
        } else {
            console.log('⚠️ Problemas encontrados:');
            problems.forEach(problem => console.log(`   ${problem}`));
        }

        // 3. Verificar conexión a endpoints principales
        console.log('\n=== PASO 3: VERIFICANDO ENDPOINTS ===');
        
        try {
            const healthResponse = await axios.get(`${BASE_URL}/health`);
            console.log(`✅ Health endpoint: ${healthResponse.status} - ${healthResponse.data}`);
        } catch (healthError) {
            console.log(`❌ Health endpoint error: ${healthError.message}`);
        }

        // 4. Estado final
        console.log('\n=== ESTADO FINAL ===');
        
        if (debug.systemInfo.readyToExecute) {
            console.log('🎉 ¡SISTEMA COMPLETAMENTE LISTO!');
            console.log('');
            console.log('🎯 PRÓXIMOS PASOS:');
            console.log('   1. Recarga la página del frontend (F5)');
            console.log('   2. Ve a la actividad "Belbin"');
            console.log('   3. Haz clic en "Crear Grupos"');
            console.log('   4. ¡El algoritmo debería funcionar!');
            console.log('');
            console.log('📱 Si persiste el error 400:');
            console.log('   - Verifica que el backend esté corriendo');
            console.log('   - Verifica que estés logueado como profesor');
            console.log('   - Abre DevTools y revisa errores en Network');
        } else {
            console.log('⚠️ Sistema aún no está completamente listo');
            console.log('💡 Revisa los problemas listados arriba');
        }

        // 5. Mostrar información adicional para debugging
        console.log('\n=== INFORMACIÓN DE DEBUGGING ===');
        console.log('🔧 Comandos útiles:');
        console.log('   node debug-simple.js          - Debug rápido');
        console.log('   node list-activities.js       - Listar actividades');
        console.log('   node fix-algorithm-config.js  - Reconfigurar algoritmo');
        console.log('');
        console.log('🌐 URLs importantes:');
        console.log(`   Backend health: ${BASE_URL}/health`);
        console.log(`   Frontend: http://localhost:4200`);
        console.log(`   Debug endpoint: ${BASE_URL}/activities/${ACTIVITY_ID}/debug-no-auth`);

    } catch (error) {
        console.error('\n❌ ERROR EN VERIFICACIÓN:');
        
        if (error.response) {
            console.error(`   Status: ${error.response.status}`);
            console.error(`   Mensaje: ${error.response.data.message || error.response.data}`);
        } else if (error.request) {
            console.error('   Error de conexión - Backend no disponible');
            console.error('   💡 Asegúrate de que el backend esté corriendo en puerto 3000');
        } else {
            console.error(`   Error: ${error.message}`);
        }
    }
}

// Ejecutar
console.log('🚀 Iniciando verificación final...');
finalVerification(); 