/**
 * Script de debugging simplificado - usa endpoint de test sin autenticación
 */

const axios = require('axios');

const ACTIVITY_ID = '686bab150b87c4e4f7f65e66';
const BASE_URL = 'http://localhost:3000';

async function debugSimple() {
    console.log('🔍 [Debug] Diagnóstico simplificado del algoritmo...');
    console.log(`📋 [Debug] Actividad: ${ACTIVITY_ID}`);
    
    try {
        // 1. Usar endpoint de debugging (sin autenticación)
        console.log('\n=== PASO 1: DEBUGGING GENERAL ===');
        const debugResponse = await axios.get(`${BASE_URL}/activities/${ACTIVITY_ID}/debug-no-auth`);
        
        console.log('✅ Debugging exitoso');
        const debug = debugResponse.data.debug;
        
        console.log('\n📊 RESUMEN DEL ESTADO:');
        console.log(`👥 Estudiantes: ${debug.students.withBelbin}/${debug.students.total} (${debug.students.completionPercentage}%)`);
        console.log(`⚙️  Algoritmo configurado: ${debug.algorithmConfig.hasValidConfig ? '✅' : '❌'}`);
        console.log(`📄 Archivo JSON: ${debug.algorithmFile.exists ? '✅' : '❌'}`);
        console.log(`🐍 Python disponible: ${debug.pythonFile.exists ? '✅' : '❌'}`);
        console.log(`📁 Directorio instances: ${debug.instancesDirectory.exists ? '✅' : '❌'}`);
        
        // Mostrar estudiantes sin BELBIN si los hay
        if (debug.students.withoutBelbin.length > 0) {
            console.log('\n❌ ESTUDIANTES SIN BELBIN:');
            debug.students.withoutBelbin.forEach(student => {
                console.log(`   - ${student.name} (${student.email})`);
            });
        }
        
        // 2. Usar endpoint de test directo
        console.log('\n=== PASO 2: TEST DIRECTO ===');
        const testResponse = await axios.post(`${BASE_URL}/activities/${ACTIVITY_ID}/test-create-groups`);
        
        console.log('✅ Test exitoso!');
        console.log('📋 Resultado:', testResponse.data.message);
        
        if (testResponse.data.steps) {
            console.log('\n📝 PASOS EJECUTADOS:');
            testResponse.data.steps.forEach((step, index) => {
                console.log(`   ${index + 1}. ${step.name}: ${step.success ? '✅' : '❌'}`);
                if (!step.success && step.error) {
                    console.log(`      Error: ${step.error}`);
                }
            });
        }
        
    } catch (error) {
        if (error.response) {
            console.log('\n❌ ERROR DEL SERVIDOR:');
            console.log('🔢 Status:', error.response.status);
            console.log('📋 Mensaje:', error.response.data.message || error.response.data);
            
            // Análisis específico del error
            if (error.response.status === 400) {
                console.log('\n🔍 ANÁLISIS DEL ERROR 400:');
                const errorData = error.response.data;
                
                if (errorData.message?.includes('BELBIN')) {
                    console.log('❌ PROBLEMA: Estudiantes sin completar test BELBIN');
                    console.log('💡 SOLUCIÓN: Todos los estudiantes deben completar el test');
                } else if (errorData.message?.includes('not configured')) {
                    console.log('❌ PROBLEMA: Algoritmo no configurado');
                    console.log('💡 SOLUCIÓN: Usar endpoint /algorithm/configure primero');
                } else {
                    console.log('❌ PROBLEMA: Error de validación');
                    console.log('📋 Detalles completos:', JSON.stringify(errorData, null, 2));
                }
            }
            
        } else if (error.request) {
            console.log('\n❌ ERROR DE CONEXIÓN:');
            console.log('🔗 No se pudo conectar al servidor en puerto 3000');
            console.log('💡 Verificar que el backend esté corriendo: npm run dev');
        } else {
            console.log('\n❌ ERROR DESCONOCIDO:');
            console.log('📋 Error:', error.message);
        }
    }
}

console.log('🚀 Iniciando debugging simplificado...');
debugSimple(); 