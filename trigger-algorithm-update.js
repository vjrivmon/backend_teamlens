/**
 * Script para activar el sistema de escucha de cambios después de simular BELBIN
 * Esto asegura que el algoritmo se actualice automáticamente al estado 'ready'
 */

const { MongoClient, ObjectId } = require('mongodb');

// Configuración
const ACTIVITY_ID = '686bab150b87c4e4f7f65e66';
const MONGO_URI = 'mongodb://localhost:27017';
const DB_NAME = 'test';

async function triggerAlgorithmUpdate() {
    console.log('🔔 [Trigger] Activando sistema de escucha de cambios...');
    console.log(`📋 [Trigger] Actividad: ${ACTIVITY_ID}`);
    
    let client;
    
    try {
        // 1. Conectar a MongoDB
        console.log('\n=== PASO 1: CONECTANDO A MONGODB ===');
        client = new MongoClient(MONGO_URI);
        await client.connect();
        const db = client.db(DB_NAME);
        console.log('✅ Conectado a MongoDB');

        // 2. Verificar estado actual
        console.log('\n=== PASO 2: VERIFICANDO ESTADO ACTUAL ===');
        const activity = await db.collection('activities').findOne({ 
            _id: new ObjectId(ACTIVITY_ID) 
        });

        if (!activity) {
            console.log('❌ Actividad no encontrada');
            return;
        }

        console.log(`✅ Actividad: "${activity.title}"`);
        console.log(`📊 Estado algoritmo: ${activity.algorithmStatus || 'not-configured'}`);
        console.log(`⚙️ Configurado: ${activity.algorithmConfig?.isConfigured || false}`);

        // 3. Verificar completitud BELBIN
        console.log('\n=== PASO 3: VERIFICANDO COMPLETITUD BELBIN ===');
        const students = await db.collection('users').find({
            _id: { $in: activity.students || [] }
        }).toArray();

        const belbinQuestionnaireId = "6718b2263e29ad19c0e0c61f";
        const studentsWithBelbin = students.filter(student => {
            return student.askedQuestionnaires?.some(q => 
                q.questionnaire.toString() === belbinQuestionnaireId && q.result
            );
        });

        console.log(`📊 BELBIN completitud: ${studentsWithBelbin.length}/${students.length}`);

        if (studentsWithBelbin.length !== students.length) {
            console.log('❌ No todos los estudiantes han completado BELBIN');
            console.log('💡 Ejecuta primero: node simulate-belbin-completion.js');
            return;
        }

        // 4. Verificar si necesita actualización
        const shouldUpdate = activity.algorithmConfig?.isConfigured && 
                           activity.algorithmStatus !== 'ready';

        if (!shouldUpdate) {
            if (!activity.algorithmConfig?.isConfigured) {
                console.log('⚠️ Algoritmo no está configurado');
                console.log('💡 Ejecuta: node fix-algorithm-config.js');
            } else {
                console.log(`✅ Algoritmo ya está en estado: ${activity.algorithmStatus}`);
            }
            return;
        }

        // 5. Actualizar estado a 'ready'
        console.log('\n=== PASO 4: ACTUALIZANDO ESTADO DEL ALGORITMO ===');
        const updateResult = await db.collection('activities').updateOne(
            { _id: new ObjectId(ACTIVITY_ID) },
            {
                $set: {
                    algorithmStatus: 'ready',
                    updatedAt: new Date()
                }
            }
        );

        if (updateResult.modifiedCount > 0) {
            console.log('✅ Estado actualizado a "ready"');
        } else {
            console.log('⚠️ No se pudo actualizar el estado');
        }

        // 6. Verificar si existe archivo JSON del algoritmo
        console.log('\n=== PASO 5: VERIFICANDO ARCHIVO JSON ===');
        const fs = require('fs');
        const path = require('path');
        
        const fileName = `activity_${ACTIVITY_ID}_belbin.json`;
        const filePath = path.join(__dirname, '../pyteamformation/instances', fileName);
        
        const fileExists = fs.existsSync(filePath);
        console.log(`📂 Archivo JSON existe: ${fileExists}`);
        
        if (!fileExists) {
            console.log('🔧 Creando archivo JSON del algoritmo...');
            
            // Crear datos del archivo JSON
            const teamSize = activity.algorithmConfig?.teamSize || 4;
            const numberOfTeams = Math.ceil(students.length / teamSize);
            
            const members = studentsWithBelbin.map(student => {
                const belbinResponse = student.askedQuestionnaires.find(q => 
                    q.questionnaire.toString() === belbinQuestionnaireId
                );
                return {
                    id: student._id.toString(),
                    traits: [belbinResponse.result]
                };
            });

            const algorithmData = {
                number_members: teamSize,
                members: members,
                agg_func: "sum",
                constraints: [
                    {
                        type: "AllAssigned",
                        name: "",
                        number_members: students.length
                    },
                    {
                        type: "NonOverlapping",
                        name: ""
                    },
                    {
                        type: "SizeCardinality",
                        name: "",
                        team_size: teamSize,
                        min: numberOfTeams,
                        max: numberOfTeams
                    }
                ],
                traits: ["TW", "CW", "CH", "ME", "CF", "SH", "PL", "RI"],
                problem_type: "TraitTeamFormation"
            };

            // Crear directorio si no existe
            const directory = path.dirname(filePath);
            if (!fs.existsSync(directory)) {
                fs.mkdirSync(directory, { recursive: true });
                console.log(`📁 Directorio creado: ${directory}`);
            }

            // Guardar archivo
            fs.writeFileSync(filePath, JSON.stringify(algorithmData, null, 2), 'utf8');
            console.log(`✅ Archivo JSON creado: ${fileName}`);
        } else {
            console.log(`✅ Archivo JSON ya existe: ${fileName}`);
        }

        // 7. Estado final
        console.log('\n=== ESTADO FINAL ===');
        const finalActivity = await db.collection('activities').findOne({ 
            _id: new ObjectId(ACTIVITY_ID) 
        });

        console.log('📊 RESUMEN:');
        console.log(`   ✅ Estudiantes con BELBIN: ${studentsWithBelbin.length}/${students.length}`);
        console.log(`   ✅ Algoritmo configurado: ${finalActivity.algorithmConfig?.isConfigured}`);
        console.log(`   ✅ Estado: ${finalActivity.algorithmStatus}`);
        console.log(`   ✅ Archivo JSON: ${fileExists || 'creado'}`);
        console.log(`   🎯 Listo para ejecutar: ${finalActivity.algorithmStatus === 'ready'}`);

        if (finalActivity.algorithmStatus === 'ready') {
            console.log('\n🎉 ¡ALGORITMO COMPLETAMENTE LISTO!');
            console.log('💡 Ahora puedes usar el botón "Crear Grupos" en el frontend');
        } else {
            console.log('\n⚠️ Algoritmo aún no está listo');
        }

        console.log('\n=== PROCESO COMPLETADO ===');

    } catch (error) {
        console.error('\n❌ ERROR EN ACTIVACIÓN:');
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
console.log('🚀 Iniciando activación del sistema de algoritmos...');
triggerAlgorithmUpdate(); 