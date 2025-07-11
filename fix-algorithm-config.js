/**
 * Script para auto-configurar el algoritmo y solucionar problemas comunes
 * Esto debería resolver el error 400 del frontend
 */

const { MongoClient, ObjectId } = require('mongodb');

// Configuración
const ACTIVITY_ID = '686bab150b87c4e4f7f65e66';
const MONGO_URI = 'mongodb://localhost:27017';
const DB_NAME = 'test';

async function fixAlgorithmConfig() {
    console.log('🔧 [Auto-Fix] Iniciando configuración automática del algoritmo...');
    console.log(`📋 [Auto-Fix] Actividad: ${ACTIVITY_ID}`);
    
    let client;
    
    try {
        // 1. Conectar a MongoDB
        console.log('\n=== PASO 1: CONECTANDO A MONGODB ===');
        client = new MongoClient(MONGO_URI);
        await client.connect();
        const db = client.db(DB_NAME);
        console.log('✅ Conectado a MongoDB');

        // 2. Obtener la actividad
        console.log('\n=== PASO 2: OBTENIENDO ACTIVIDAD ===');
        const activity = await db.collection('activities').findOne({ 
            _id: new ObjectId(ACTIVITY_ID) 
        });

        if (!activity) {
            console.log('❌ Actividad no encontrada');
            return;
        }

        console.log(`✅ Actividad encontrada: "${activity.title}"`);
        console.log(`👥 Estudiantes: ${activity.students?.length || 0}`);
        console.log(`📊 Estado actual: ${activity.algorithmStatus || 'not-configured'}`);

        // 3. Verificar estudiantes y BELBIN
        console.log('\n=== PASO 3: VERIFICANDO ESTUDIANTES Y BELBIN ===');
        const students = await db.collection('users').find({
            _id: { $in: activity.students || [] }
        }).toArray();

        const belbinQuestionnaireId = "6718b2263e29ad19c0e0c61f";
        const studentsWithBelbin = students.filter(student => {
            return student.askedQuestionnaires?.some(q => 
                q.questionnaire.toString() === belbinQuestionnaireId && q.result
            );
        });

        const studentsWithoutBelbin = students.filter(student => {
            return !student.askedQuestionnaires?.some(q => 
                q.questionnaire.toString() === belbinQuestionnaireId && q.result
            );
        });

        console.log(`👥 Total estudiantes: ${students.length}`);
        console.log(`✅ Con BELBIN: ${studentsWithBelbin.length}`);
        console.log(`❌ Sin BELBIN: ${studentsWithoutBelbin.length}`);

        if (studentsWithoutBelbin.length > 0) {
            console.log('\n⚠️  ESTUDIANTES SIN BELBIN:');
            studentsWithoutBelbin.forEach(s => {
                console.log(`   - ${s.name} (${s.email})`);
            });
        }

        // 4. Auto-configurar algoritmo
        console.log('\n=== PASO 4: AUTO-CONFIGURANDO ALGORITMO ===');
        
        const totalStudents = students.length;
        const idealTeamSize = 4; // Tamaño ideal para equipos
        const minTeams = Math.floor(totalStudents / idealTeamSize);
        const maxTeams = Math.ceil(totalStudents / (idealTeamSize - 1));

        const algorithmConfig = {
            teamSize: idealTeamSize,
            minTeams: Math.max(1, minTeams),
            maxTeams: Math.max(2, maxTeams),
            exclusions: [],
            inclusions: [],
            additionalConstraints: [],
            aggFunc: "sum",
            problemType: "TraitTeamFormation",
            isConfigured: true,
            lastConfiguredAt: new Date()
        };

        console.log('⚙️  Configuración automática:');
        console.log(`   - Tamaño de equipo: ${algorithmConfig.teamSize}`);
        console.log(`   - Equipos mínimos: ${algorithmConfig.minTeams}`);
        console.log(`   - Equipos máximos: ${algorithmConfig.maxTeams}`);

        // 5. Determinar estado del algoritmo
        let algorithmStatus = 'configured';
        if (studentsWithBelbin.length === totalStudents && totalStudents > 0) {
            algorithmStatus = 'ready';
            console.log('🎯 Estado: READY (todos tienen BELBIN)');
        } else {
            console.log('⏳ Estado: CONFIGURED (esperando BELBIN)');
        }

        // 6. Actualizar la actividad
        console.log('\n=== PASO 5: ACTUALIZANDO ACTIVIDAD ===');
        const updateResult = await db.collection('activities').updateOne(
            { _id: new ObjectId(ACTIVITY_ID) },
            {
                $set: {
                    algorithmConfig: algorithmConfig,
                    algorithmStatus: algorithmStatus,
                    updatedAt: new Date()
                }
            }
        );

        if (updateResult.matchedCount > 0) {
            console.log('✅ Actividad actualizada exitosamente');
        } else {
            console.log('❌ Error actualizando actividad');
            return;
        }

        // 7. Verificar resultado final
        console.log('\n=== PASO 6: VERIFICACIÓN FINAL ===');
        const updatedActivity = await db.collection('activities').findOne({ 
            _id: new ObjectId(ACTIVITY_ID) 
        });

        console.log('📊 ESTADO FINAL:');
        console.log(`   ✅ Algoritmo configurado: ${updatedActivity.algorithmConfig?.isConfigured}`);
        console.log(`   📊 Estado: ${updatedActivity.algorithmStatus}`);
        console.log(`   👥 Estudiantes con BELBIN: ${studentsWithBelbin.length}/${totalStudents}`);
        console.log(`   🎯 Listo para ejecutar: ${algorithmStatus === 'ready'}`);

        if (algorithmStatus === 'ready') {
            console.log('\n🎉 ¡ALGORITMO LISTO PARA EJECUTAR!');
            console.log('💡 Ahora puedes probar el botón "Crear Grupos" en el frontend');
        } else {
            console.log('\n⚠️  ACCIÓN REQUERIDA:');
            console.log(`💡 ${studentsWithoutBelbin.length} estudiantes deben completar el test BELBIN`);
        }

        console.log('\n=== CONFIGURACIÓN COMPLETADA ===');

    } catch (error) {
        console.error('\n❌ ERROR EN AUTO-CONFIGURACIÓN:');
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
console.log('🚀 Iniciando auto-fix del algoritmo...');
fixAlgorithmConfig(); 