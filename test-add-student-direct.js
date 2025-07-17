/**
pm2 * Test Script - Simulación Directa de Añadir Estudiantes (PRODUCCIÓN)
 * Bypasa el frontend para probar directamente el backend en producción
 * 
 * @author TeamLens DevOps Team
 * @version 1.0.0
 */

const { MongoClient, ObjectId } = require('mongodb');

// Configuración para producción
const mongoUri = 'mongodb://localhost:27017/';
const dbName = 'teamlens_prod'; // Base de datos de producción

// Importar la función directamente
async function testAddStudentDirect() {
    console.log('🚀 [Test] Iniciando test directo de añadir estudiantes...');
    
    const client = new MongoClient(mongoUri);
    
    try {
        await client.connect();
        console.log('✅ [Test] Conectado a MongoDB');
        
        const db = client.db(dbName);
        
        // Buscar actividades existentes
        const activities = await db.collection('activities').find({}).toArray();
        console.log(`📊 [Test] Actividades encontradas: ${activities.length}`);
        
        if (activities.length === 0) {
            console.log('❌ [Test] No hay actividades en la base de datos de producción');
            console.log('💡 [Test] Crear una actividad desde el frontend primero');
            return;
        }
        
        // Mostrar actividades disponibles
        console.log('📋 [Test] Actividades disponibles:');
        activities.forEach((activity, index) => {
            console.log(`  ${index + 1}. ${activity.title} (${activity._id})`);
        });
        
        const activityId = activities[0]._id.toString();
        console.log(`📋 [Test] Usando actividad: ${activities[0].title} (${activityId})`);
        
        // Simular la llamada HTTP directamente al backend
        const testEmail = 'vicenterivas773@gmail.com';
        
        console.log(`📧 [Test] Simulando añadir estudiante: ${testEmail}`);
        
        // Hacer petición HTTP al backend de producción
        const response = await fetch(`http://localhost:3000/api/activities/${activityId}/students`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // En producción necesitaríamos un token válido
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
 * Test usando importación directa de funciones (PRODUCCIÓN)
 */
async function testCreateNonRegisteredAccountDirect() {
    console.log('\n🚀 [Test] Test directo de createNonRegisteredAccount...');
    
    try {
        // En producción, importamos desde build/ no src/
        const { connectToDatabase } = require('./build/services/database.service');
        const { createNonRegisteredAccount } = require('./build/functions/user-functions');
        
        console.log('🔗 [Test] Conectando a base de datos de producción...');
        await connectToDatabase();
        console.log('✅ [Test] Conectado a base de datos');
        
        const testEmail = 'vicenterivas773@gmail.com';
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
        
        if (error.code === 'MODULE_NOT_FOUND') {
            console.log('💡 [Test] Intenta compilar primero: npm run tsc');
        }
    }
}

/**
 * Test simple usando solo MongoDB (sin importar módulos)
 */
async function testDatabaseConnection() {
    console.log('\n🚀 [Test] Test de conexión y datos en BD...');
    
    const client = new MongoClient(mongoUri);
    
    try {
        await client.connect();
        console.log('✅ [Test] Conectado a MongoDB');
        
        const db = client.db(dbName);
        
        // Verificar datos
        const activitiesCount = await db.collection('activities').countDocuments();
        const usersCount = await db.collection('users').countDocuments();
        
        console.log(`📊 [Test] Estadísticas de la BD:`);
        console.log(`  - Actividades: ${activitiesCount}`);
        console.log(`  - Usuarios: ${usersCount}`);
        
        // Mostrar algunas actividades
        if (activitiesCount > 0) {
            const activities = await db.collection('activities').find({}).limit(3).toArray();
            console.log(`📋 [Test] Actividades recientes:`);
            activities.forEach(activity => {
                console.log(`  - ${activity.title} (ID: ${activity._id})`);
                console.log(`    Estudiantes: ${activity.students?.length || 0}`);
            });
        }
        
        // Mostrar algunos usuarios temporales
        const tempUsers = await db.collection('users').find({ 
            isTemporary: true 
        }).limit(3).toArray();
        
        console.log(`👥 [Test] Usuarios temporales encontrados: ${tempUsers.length}`);
        tempUsers.forEach(user => {
            console.log(`  - ${user.email} (Creado: ${user.createdAt})`);
        });
        
    } catch (error) {
        console.error('❌ [Test] Error de conexión:', error);
    } finally {
        await client.close();
    }
}

// Ejecutar tests
async function runAllDirectTests() {
    console.log('🧪 [Test] === TESTS DIRECTOS PARA PRODUCCIÓN ===\n');
    
    // Test 0: Verificar BD y datos
    await testDatabaseConnection();
    
    // Test 1: Petición HTTP (requiere autenticación)
    await testAddStudentDirect();
    
    // Test 2: Función directa (requiere compilación)
    await testCreateNonRegisteredAccountDirect();
    
    console.log('\n✅ [Test] Tests directos completados');
    console.log('\n💡 [Test] Próximos pasos:');
    console.log('  1. Si no hay actividades, crear una desde el frontend');
    console.log('  2. Si hay problemas de compilación: npm run tsc');
    console.log('  3. Para test completo: añadir estudiante desde frontend con logs del backend activos');
}

if (require.main === module) {
    runAllDirectTests().catch(console.error);
}

module.exports = {
    testAddStudentDirect,
    testCreateNonRegisteredAccountDirect,
    testDatabaseConnection,
    runAllDirectTests
}; 