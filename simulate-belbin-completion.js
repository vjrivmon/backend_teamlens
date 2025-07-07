/**
 * Script para simular la completitud del test BELBIN
 * Esto permite probar el algoritmo inmediatamente sin esperar a que los estudiantes reales completen el test
 */

const { MongoClient, ObjectId } = require('mongodb');

// Configuración
const ACTIVITY_ID = '686bab150b87c4e4f7f65e66';
const MONGO_URI = 'mongodb://localhost:27017';
const DB_NAME = 'test';
const BELBIN_QUESTIONNAIRE_ID = '6718b2263e29ad19c0e0c61f';

// Roles BELBIN disponibles para asignar aleatoriamente
const BELBIN_ROLES = ["TW", "CW", "CH", "ME", "CF", "SH", "PL", "RI"];

async function simulateBelbinCompletion() {
    console.log('🎯 [Simulate] Simulando completitud del test BELBIN...');
    console.log(`📋 [Simulate] Actividad: ${ACTIVITY_ID}`);
    
    let client;
    
    try {
        // 1. Conectar a MongoDB
        console.log('\n=== PASO 1: CONECTANDO A MONGODB ===');
        client = new MongoClient(MONGO_URI);
        await client.connect();
        const db = client.db(DB_NAME);
        console.log('✅ Conectado a MongoDB');

        // 2. Obtener la actividad y sus estudiantes
        console.log('\n=== PASO 2: OBTENIENDO ESTUDIANTES ===');
        const activity = await db.collection('activities').findOne({ 
            _id: new ObjectId(ACTIVITY_ID) 
        });

        if (!activity) {
            console.log('❌ Actividad no encontrada');
            return;
        }

        const students = await db.collection('users').find({
            _id: { $in: activity.students || [] }
        }).toArray();

        console.log(`✅ Actividad encontrada: "${activity.title}"`);
        console.log(`👥 Estudiantes a procesar: ${students.length}`);

        // 3. Verificar estado actual
        console.log('\n=== PASO 3: VERIFICANDO ESTADO ACTUAL ===');
        const studentsWithBelbin = students.filter(student => {
            return student.askedQuestionnaires?.some(q => 
                q.questionnaire.toString() === BELBIN_QUESTIONNAIRE_ID && q.result
            );
        });

        console.log(`📊 Estado actual: ${studentsWithBelbin.length}/${students.length} han completado BELBIN`);

        // 4. Simular completitud para todos
        console.log('\n=== PASO 4: SIMULANDO COMPLETITUD BELBIN ===');
        let simulatedCount = 0;

        for (const student of students) {
            // Verificar si ya tiene BELBIN completado
            const hasCompleted = student.askedQuestionnaires?.some(q => 
                q.questionnaire.toString() === BELBIN_QUESTIONNAIRE_ID && q.result
            );

            if (hasCompleted) {
                console.log(`✅ ${student.email} ya tiene BELBIN completado`);
                continue;
            }

            // Asignar un rol BELBIN aleatorio
            const randomRole = BELBIN_ROLES[Math.floor(Math.random() * BELBIN_ROLES.length)];
            const completionDate = new Date();

            const belbinResponse = {
                questionnaire: new ObjectId(BELBIN_QUESTIONNAIRE_ID),
                result: randomRole,
                completedAt: completionDate
            };

            // Actualizar el estudiante
            const updateResult = await db.collection('users').updateOne(
                { _id: student._id },
                {
                    $push: {
                        askedQuestionnaires: belbinResponse
                    }
                }
            );

            if (updateResult.modifiedCount > 0) {
                console.log(`✅ ${student.email} → ${randomRole} (simulado)`);
                simulatedCount++;
            } else {
                console.log(`❌ Error simulando BELBIN para ${student.email}`);
            }
        }

        console.log(`\n🎉 SIMULACIÓN COMPLETADA`);
        console.log(`   - Estudiantes procesados: ${students.length}`);
        console.log(`   - BELBIN simulados: ${simulatedCount}`);
        console.log(`   - Total completados: ${studentsWithBelbin.length + simulatedCount}/${students.length}`);

        // 5. Verificar estado final
        console.log('\n=== PASO 5: VERIFICACIÓN FINAL ===');
        const updatedStudents = await db.collection('users').find({
            _id: { $in: activity.students || [] }
        }).toArray();

        const finalWithBelbin = updatedStudents.filter(student => {
            return student.askedQuestionnaires?.some(q => 
                q.questionnaire.toString() === BELBIN_QUESTIONNAIRE_ID && q.result
            );
        });

        console.log(`📊 Estado final: ${finalWithBelbin.length}/${updatedStudents.length} han completado BELBIN`);

        if (finalWithBelbin.length === updatedStudents.length) {
            console.log('\n🎯 ¡PERFECTO! Todos los estudiantes tienen BELBIN completado');
            console.log('💡 Ahora puedes usar el botón "Crear Grupos" en el frontend');
            
            // Mostrar distribución de roles
            console.log('\n📊 DISTRIBUCIÓN DE ROLES BELBIN:');
            const roleDistribution = {};
            finalWithBelbin.forEach(student => {
                const belbinResponse = student.askedQuestionnaires.find(q => 
                    q.questionnaire.toString() === BELBIN_QUESTIONNAIRE_ID
                );
                const role = belbinResponse.result;
                roleDistribution[role] = (roleDistribution[role] || 0) + 1;
            });

            Object.entries(roleDistribution).forEach(([role, count]) => {
                console.log(`   ${role}: ${count} estudiante(s)`);
            });

        } else {
            console.log('\n⚠️ Aún faltan estudiantes por completar BELBIN');
        }

        console.log('\n=== PROCESO COMPLETADO ===');

    } catch (error) {
        console.error('\n❌ ERROR EN SIMULACIÓN:');
        console.error('📋 Error:', error.message);
        console.error('📊 Stack:', error.stack);
    } finally {
        if (client) {
            await client.close();
            console.log('🔐 Conexión MongoDB cerrada');
        }
    }
}

// Ejecutar
console.log('🚀 Iniciando simulación de BELBIN...');
simulateBelbinCompletion(); 