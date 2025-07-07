/**
 * Script de debugging para simular exactamente la llamada del frontend
 * Esto nos permitirá ver el error exacto que está devolviendo el servidor
 */

const axios = require('axios');

// Configuración (cambiar estos valores según tu sesión actual)
const ACTIVITY_ID = '686bab150b87c4e4f7f65e66';  // ID de la actividad que estás usando
const BASE_URL = 'http://localhost:3000';

// Cookie de sesión - la necesitas obtener del navegador
// Ve a DevTools → Application → Cookies → localhost:3000 → copia el valor de "session"
const SESSION_COOKIE = 'TU_SESSION_COOKIE_AQUI';  // ⚠️ CAMBIAR ESTE VALOR

async function debugFrontendCall() {
    console.log('🔍 [Debug] Simulando llamada exacta del frontend...');
    console.log(`📋 [Debug] Actividad: ${ACTIVITY_ID}`);
    console.log(`🔗 [Debug] URL: ${BASE_URL}`);
    
    try {
        // 1. Primero hacer debugging completo
        console.log('\n=== PASO 1: DEBUGGING COMPLETO ===');
        const debugResponse = await axios.get(
            `${BASE_URL}/activities/${ACTIVITY_ID}/debug`,
            {
                headers: {
                    'Cookie': `session=${SESSION_COOKIE}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        
        console.log('✅ Debugging exitoso');
        console.log('📊 Resumen:', {
            estudiantesTotal: debugResponse.data.debug.students.total,
            estudiantesConBelbin: debugResponse.data.debug.students.withBelbin,
            completitud: debugResponse.data.debug.students.completionPercentage + '%',
            configValida: debugResponse.data.debug.algorithmConfig.hasValidConfig,
            archivoExiste: debugResponse.data.debug.algorithmFile.exists
        });
        
        // 2. Luego intentar ejecutar algoritmo (como el frontend)
        console.log('\n=== PASO 2: EJECUTAR ALGORITMO (COMO FRONTEND) ===');
        const executeResponse = await axios.post(
            `${BASE_URL}/activities/${ACTIVITY_ID}/algorithm/execute`,
            {}, // Sin body, como el frontend corregido
            {
                headers: {
                    'Cookie': `session=${SESSION_COOKIE}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        
        console.log('✅ Algoritmo ejecutado exitosamente!');
        console.log('📋 Respuesta:', executeResponse.data);
        
    } catch (error) {
        if (error.response) {
            console.log('\n❌ ERROR DEL SERVIDOR:');
            console.log('🔢 Status:', error.response.status);
            console.log('📋 Mensaje:', error.response.data.message || error.response.data);
            console.log('📊 Detalles:', JSON.stringify(error.response.data, null, 2));
            
            // Si es 400, mostrar qué validación específica falló
            if (error.response.status === 400) {
                console.log('\n🔍 ANÁLISIS DEL ERROR 400:');
                const errorMsg = error.response.data.message;
                
                if (errorMsg.includes('not configured')) {
                    console.log('❌ PROBLEMA: Algoritmo no configurado');
                    console.log('💡 SOLUCIÓN: Configurar algoritmo primero');
                } else if (errorMsg.includes('BELBIN')) {
                    console.log('❌ PROBLEMA: Estudiantes sin completar BELBIN');
                    console.log('💡 SOLUCIÓN: Verificar que todos hayan completado el test');
                } else if (errorMsg.includes('permission')) {
                    console.log('❌ PROBLEMA: Sin permisos');
                    console.log('💡 SOLUCIÓN: Verificar session cookie');
                } else {
                    console.log('❌ PROBLEMA: Otro error de validación');
                    console.log('📋 Mensaje completo:', errorMsg);
                }
            }
            
        } else if (error.request) {
            console.log('\n❌ ERROR DE CONEXIÓN:');
            console.log('🔗 No se pudo conectar al servidor');
            console.log('💡 Verificar que el backend esté corriendo en puerto 3000');
        } else {
            console.log('\n❌ ERROR DESCONOCIDO:');
            console.log('📋 Error:', error.message);
        }
    }
}

// Verificar configuración antes de ejecutar
if (SESSION_COOKIE === 'TU_SESSION_COOKIE_AQUI') {
    console.log('⚠️  CONFIGURACIÓN REQUERIDA:');
    console.log('1. Abre DevTools en el navegador (F12)');
    console.log('2. Ve a Application → Cookies → localhost:3000');
    console.log('3. Copia el valor de "session"');
    console.log('4. Pégalo en SESSION_COOKIE en este archivo');
    console.log('5. Ejecuta: node debug-frontend-call.js');
} else {
    debugFrontendCall();
} 