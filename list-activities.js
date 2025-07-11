/**
 * Script para listar todas las actividades y encontrar el ID correcto
 */

const { MongoClient, ObjectId } = require('mongodb');

// Configuración
const MONGO_URI = 'mongodb://localhost:27017';
const DB_NAME = 'test';

async function listActivities() {
    console.log('📋 [List] Listando todas las actividades disponibles...');
    
    let client;
    
    try {
        // 1. Conectar a MongoDB
        console.log('\n=== CONECTANDO A MONGODB ===');
        client = new MongoClient(MONGO_URI);
        await client.connect();
        const db = client.db(DB_NAME);
        console.log('✅ Conectado a MongoDB');

        // 2. Listar todas las actividades
        console.log('\n=== LISTANDO ACTIVIDADES ===');
        const activities = await db.collection('activities').find({}).toArray();

        if (activities.length === 0) {
            console.log('❌ No se encontraron actividades en la base de datos');
            
            // Verificar si existen otras colecciones
            console.log('\n📊 Verificando colecciones disponibles...');
            const collections = await db.listCollections().toArray();
            console.log('📁 Colecciones encontradas:');
            collections.forEach(col => {
                console.log(`   - ${col.name}`);
            });
            return;
        }

        console.log(`✅ Encontradas ${activities.length} actividades:`);
        console.log('\n📋 ACTIVIDADES DISPONIBLES:');
        
        for (let i = 0; i < activities.length; i++) {
            const activity = activities[i];
            console.log(`\n${i + 1}. "${activity.title}"`);
            console.log(`   🆔 ID: ${activity._id}`);
            console.log(`   👥 Estudiantes: ${activity.students?.length || 0}`);
            console.log(`   📊 Estado algoritmo: ${activity.algorithmStatus || 'not-configured'}`);
            console.log(`   📅 Creada: ${activity.createdAt ? new Date(activity.createdAt).toLocaleDateString() : 'N/A'}`);
            console.log(`   ⚙️  Configurado: ${activity.algorithmConfig?.isConfigured || false}`);
            
            if (activity.students?.length > 0) {
                // Verificar BELBIN de los estudiantes
                const students = await db.collection('users').find({
                    _id: { $in: activity.students || [] }
                }).toArray();

                const belbinQuestionnaireId = "6718b2263e29ad19c0e0c61f";
                const studentsWithBelbin = students.filter(student => {
                    return student.askedQuestionnaires?.some(q => 
                        q.questionnaire.toString() === belbinQuestionnaireId && q.result
                    );
                });

                console.log(`   🧪 BELBIN: ${studentsWithBelbin.length}/${students.length} completado`);
                
                if (studentsWithBelbin.length === students.length && students.length > 0) {
                    console.log(`   🎯 ESTADO: ¡Listo para algoritmo!`);
                } else if (studentsWithBelbin.length > 0) {
                    console.log(`   ⏳ ESTADO: Esperando ${students.length - studentsWithBelbin.length} estudiantes BELBIN`);
                } else {
                    console.log(`   ❌ ESTADO: Ningún estudiante ha completado BELBIN`);
                }
            }
        }

        // 3. Sugerir cual usar
        console.log('\n=== RECOMENDACIONES ===');
        
        const readyActivities = activities.filter(activity => {
            return activity.students?.length > 0 && activity.algorithmConfig?.isConfigured;
        });

        if (readyActivities.length > 0) {
            console.log('🎯 ACTIVIDADES RECOMENDADAS PARA TESTING:');
            readyActivities.forEach((activity, index) => {
                console.log(`   ${index + 1}. "${activity.title}" (ID: ${activity._id})`);
            });
        } else {
            const activitiesWithStudents = activities.filter(activity => activity.students?.length > 0);
            if (activitiesWithStudents.length > 0) {
                console.log('📝 ACTIVIDADES CON ESTUDIANTES (necesitan configuración):');
                activitiesWithStudents.forEach((activity, index) => {
                    console.log(`   ${index + 1}. "${activity.title}" (ID: ${activity._id})`);
                });
            } else {
                console.log('⚠️  No hay actividades con estudiantes asignados');
            }
        }

        console.log('\n💡 PARA USAR EN LOS SCRIPTS:');
        console.log('1. Copia uno de los IDs de arriba');
        console.log('2. Actualiza la variable ACTIVITY_ID en fix-algorithm-config.js');
        console.log('3. Ejecuta: node fix-algorithm-config.js');

    } catch (error) {
        console.error('\n❌ ERROR LISTANDO ACTIVIDADES:');
        console.error('📋 Error:', error.message);
        console.error('📊 Stack:', error.stack);
    } finally {
        if (client) {
            await client.close();
            console.log('\n🔐 Conexión MongoDB cerrada');
        }
    }
}

// Ejecutar
console.log('🚀 Iniciando listado de actividades...');
listActivities(); 