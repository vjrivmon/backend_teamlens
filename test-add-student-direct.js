/**
 * Test Script - Simulación Directa de Añadir Estudiantes
 * Bypasa el frontend para probar directamente el backend
 * 
 * @author TeamLens DevOps Team
 * @version 1.0.0
 */

const { MongoClient, ObjectId } = require('mongodb');

// Importar la función directamente
async function testAddStudentDirect() {
    console.log('🚀 [Test] Iniciando test directo de añadir estudiantes...');
    
    // Conectar a MongoDB
    const mongoUri = 'mongodb://localhost:27017/';
    const dbName = 'test';
    
    const client = new MongoClient(mongoUri);
    
    try {
        await client.connect();
        console.log('✅ [Test] Conectado a MongoDB');
        
        const db = client.db(dbName);
        
        // Buscar una actividad existente
        const activities = await db.collection('activities').find({}).limit(1).toArray();
        
        if (activities.length === 0) {
            console.log('❌ [Test] No hay actividades en la base de datos');
            return;
        }
        
        const activityId = activities[0]._id.toString();
        console.log(`📋 [Test] Usando actividad: ${activities[0].title} (${activityId})`);
        
        // Simular la llamada HTTP directamente al backend
        const testEmail = 'vicenterivas773@gmail.com'; // Cambiar por tu email
        
        console.log(`📧 [Test] Simulando añadir estudiante: ${testEmail}`);
        
        // Hacer petición HTTP al backend
        const response = await fetch(`http://localhost:3000/api/activities/${activityId}/students`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // Necesitamos obtener un token de autenticación válido
                // Por ahora haremos un test básico
            },
            body: JSON.stringify({
                emails: [testEmail]
            })
        });
        
        if (response.ok) {
            const result = await response.json();
            console.log('✅ [Test] Petición exitosa:', result);
        } else {
            const error = await response.text();
            console.log('❌ [Test] Error en petición:', response.status, error);
            
            if (response.status === 401) {
                console.log('🔐 [Test] Error de autenticación - necesita token válido');
                console.log('💡 [Test] Ejecuta el test desde el frontend o con token de sesión');
            }
        }
        
    } catch (error) {
        console.error('❌ [Test] Error en test directo:', error);
    } finally {
        await client.close();
    }
}

/**
 * Test usando importación directa de funciones (más directo)
 */
async function testCreateNonRegisteredAccountDirect() {
    console.log('\n🚀 [Test] Test directo de createNonRegisteredAccount...');
    
    try {
        // Importar función y conectar a DB
        const { connectToDatabase } = require('./src/services/database.service');
        const { createNonRegisteredAccount } = require('./src/functions/user-functions');
        
        console.log('🔗 [Test] Conectando a base de datos...');
        await connectToDatabase();
        console.log('✅ [Test] Conectado a base de datos');
        
        const testEmail = 'vicenterivas773@gmail.com'; // Cambiar por tu email
        console.log(`📧 [Test] Creando cuenta temporal para: ${testEmail}`);
        
        const result = await createNonRegisteredAccount(testEmail);
        
        if (result) {
            console.log(`✅ [Test] Usuario temporal creado exitosamente: ${result}`);
            console.log('📧 [Test] Si todo funcionó, deberías recibir un email');
        } else {
            console.log('❌ [Test] No se pudo crear el usuario temporal');
        }
        
    } catch (error) {
        console.error('❌ [Test] Error en test de función directa:', error);
        console.error('📍 [Test] Stack trace:', error.stack);
    }
}

// Ejecutar tests
async function runAllDirectTests() {
    console.log('🧪 [Test] === TESTS DIRECTOS DE AÑADIR ESTUDIANTES ===\n');
    
    // Test 1: Petición HTTP
    await testAddStudentDirect();
    
    // Test 2: Función directa
    await testCreateNonRegisteredAccountDirect();
    
    console.log('\n✅ [Test] Tests directos completados');
}

if (require.main === module) {
    runAllDirectTests().catch(console.error);
}

module.exports = {
    testAddStudentDirect,
    testCreateNonRegisteredAccountDirect,
    runAllDirectTests
}; 