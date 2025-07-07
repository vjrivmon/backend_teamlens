/**
 * Script de verificación final del estado - acceso directo a MongoDB
 */

const { MongoClient, ObjectId } = require('mongodb');
const fs = require('fs');
const path = require('path');

// Configuración
const ACTIVITY_ID = '686bab150b87c4e4f7f65e66';
const MONGO_URI = 'mongodb://localhost:27017';
const DB_NAME = 'test';
const BELBIN_QUESTIONNAIRE_ID = '6718b2263e29ad19c0e0c61f';

async function verifyFinalState() {
    console.log('🔍 [Verify] Verificación final del estado del sistema...');
    console.log(`📋 [Verify] Actividad: ${ACTIVITY_ID}`);
    
    let client;
    
    try {
        // 1. Conectar a MongoDB
        console.log('\n=== PASO 1: CONECTANDO A MONGODB ===');
        client = new MongoClient(MONGO_URI);
        await client.connect();
        const db = client.db(DB_NAME);
        console.log('✅ Conectado a MongoDB');

        // 2. Verificar actividad
        console.log('\n=== PASO 2: VERIFICANDO ACTIVIDAD ===');
        const activity = await db.collection('activities').findOne({ 
            _id: new ObjectId(ACTIVITY_ID) 
        });

        if (!activity) {
            console.log('❌ Actividad no encontrada');
            return;
        }

        console.log(`✅ Actividad encontrada: "${activity.title}"`);
        console.log(`📊 Estado: ${activity.status || 'indefinido'}`);
        console.log(`🤖 Algoritmo estado: ${activity.algorithmStatus || 'not-configured'}`);
        console.log(`⚙️ Algoritmo configurado: ${activity.algorithmConfig?.isConfigured || false}`);

        // 3. Verificar estudiantes y BELBIN
        console.log('\n=== PASO 3: VERIFICANDO ESTUDIANTES Y BELBIN ===');
        const students = await db.collection('users').find({
            _id: { $in: activity.students || [] }
        }).toArray();

        console.log(`👥 Total estudiantes: ${students.length}`);

        const studentsWithBelbin = students.filter(student => {
            return student.askedQuestionnaires?.some(q => 
                q.questionnaire.toString() === BELBIN_QUESTIONNAIRE_ID && q.result
            );
        });

        const studentsWithoutBelbin = students.filter(student => {
            return !student.askedQuestionnaires?.some(q => 
                q.questionnaire.toString() === BELBIN_QUESTIONNAIRE_ID && q.result
            );
        });

        console.log(`✅ Con BELBIN: ${studentsWithBelbin.length}`);
        console.log(`❌ Sin BELBIN: ${studentsWithoutBelbin.length}`);
        console.log(`📊 Completitud: ${Math.round((studentsWithBelbin.length / students.length) * 100)}%`);

        if (studentsWithoutBelbin.length > 0) {
            console.log('\n⚠️ ESTUDIANTES SIN BELBIN:');
            studentsWithoutBelbin.forEach(student => {
                console.log(`   - ${student.name} (${student.email})`);
            });
        }

        // Mostrar roles BELBIN asignados
        if (studentsWithBelbin.length > 0) {
            console.log('\n📊 ROLES BELBIN ASIGNADOS:');
            const roleCount = {};
            studentsWithBelbin.forEach(student => {
                const belbinResponse = student.askedQuestionnaires.find(q => 
                    q.questionnaire.toString() === BELBIN_QUESTIONNAIRE_ID
                );
                const role = belbinResponse.result;
                roleCount[role] = (roleCount[role] || 0) + 1;
            });
            
            Object.entries(roleCount).forEach(([role, count]) => {
                console.log(`   ${role}: ${count} estudiante(s)`);
            });
        }

        // 4. Verificar configuración del algoritmo
        console.log('\n=== PASO 4: VERIFICANDO CONFIGURACIÓN DEL ALGORITMO ===');
        
        const config = activity.algorithmConfig;
        if (config && config.isConfigured) {
            console.log('✅ Algoritmo configurado');
            console.log(`   📐 Tamaño de equipo: ${config.teamSize || 'no especificado'}`);
            console.log(`   📋 Restricciones: ${config.constraints?.length || 0}`);
        } else {
            console.log('❌ Algoritmo no configurado');
        }

        // 5. Verificar archivos del sistema
        console.log('\n=== PASO 5: VERIFICANDO ARCHIVOS DEL SISTEMA ===');
        
        // Verificar archivo JSON del algoritmo
        const jsonFileName = `activity_${ACTIVITY_ID}_belbin.json`;
        const jsonFilePath = path.join(__dirname, '../pyteamformation/instances', jsonFileName);
        const jsonExists = fs.existsSync(jsonFilePath);
        console.log(`📄 Archivo JSON: ${jsonExists ? '✅' : '❌'} (${jsonFileName})`);

        // Verificar script Python
        const pythonFilePath = path.join(__dirname, '../pyteamformation/equipos_lola.py');
        const pythonExists = fs.existsSync(pythonFilePath);
        console.log(`🐍 Script Python: ${pythonExists ? '✅' : '❌'} (equipos_lola.py)`);

        // Verificar directorio instances
        const instancesDir = path.join(__dirname, '../pyteamformation/instances');
        const instancesDirExists = fs.existsSync(instancesDir);
        console.log(`📁 Directorio instances: ${instancesDirExists ? '✅' : '❌'}`);

        // 6. Verificar si puede leer archivo JSON
        if (jsonExists) {
            try {
                const jsonContent = JSON.parse(fs.readFileSync(jsonFilePath, 'utf8'));
                console.log(`📖 Archivo JSON válido: ✅ (${jsonContent.members?.length || 0} miembros)`);
            } catch (jsonError) {
                console.log(`📖 Archivo JSON corrupto: ❌ (${jsonError.message})`);
            }
        }

        // 7. Análisis final
        console.log('\n=== ANÁLISIS FINAL ===');
        
        const allStudentsHaveBelbin = studentsWithBelbin.length === students.length && students.length > 0;
        const algorithmConfigured = config && config.isConfigured;
        const algorithmReady = activity.algorithmStatus === 'ready';
        const filesExist = jsonExists && pythonExists && instancesDirExists;
        
        const systemReady = allStudentsHaveBelbin && algorithmConfigured && algorithmReady && filesExist;

        console.log('📊 CHECKLIST COMPLETO:');
        console.log(`   👥 Todos tienen BELBIN: ${allStudentsHaveBelbin ? '✅' : '❌'}`);
        console.log(`   ⚙️ Algoritmo configurado: ${algorithmConfigured ? '✅' : '❌'}`);
        console.log(`   🎯 Estado ready: ${algorithmReady ? '✅' : '❌'}`);
        console.log(`   📁 Archivos existen: ${filesExist ? '✅' : '❌'}`);
        console.log(`   🎉 SISTEMA LISTO: ${systemReady ? '✅' : '❌'}`);

        if (systemReady) {
            console.log('\n🎉 ¡SISTEMA COMPLETAMENTE FUNCIONAL!');
            console.log('');
            console.log('🎯 INSTRUCCIONES PARA EL FRONTEND:');
            console.log('   1. Asegúrate de que el backend esté corriendo (npm run dev)');
            console.log('   2. Recarga la página del frontend (F5)');
            console.log('   3. Ve a la actividad "Belbin"');
            console.log('   4. Configura restricciones si es necesario');
            console.log('   5. Haz clic en "Crear Grupos"');
            console.log('');
            console.log('📱 Si sigue dando error 400:');
            console.log('   - Verifica autenticación (login como profesor)');
            console.log('   - Verifica cookies de sesión');
            console.log('   - Abre DevTools → Network para ver detalles');
        } else {
            console.log('\n⚠️ SISTEMA NO ESTÁ COMPLETAMENTE LISTO');
            console.log('💡 Revisa los elementos marcados con ❌ arriba');
            
            if (!allStudentsHaveBelbin) {
                console.log('🔧 Para completar BELBIN: node simulate-belbin-completion.js');
            }
            if (!algorithmConfigured) {
                console.log('🔧 Para configurar algoritmo: node fix-algorithm-config.js');
            }
            if (!algorithmReady || !filesExist) {
                console.log('🔧 Para activar sistema: node trigger-algorithm-update.js');
            }
        }

        console.log('\n=== VERIFICACIÓN COMPLETADA ===');

    } catch (error) {
        console.error('\n❌ ERROR EN VERIFICACIÓN:');
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
console.log('🚀 Iniciando verificación final...');
verifyFinalState(); 