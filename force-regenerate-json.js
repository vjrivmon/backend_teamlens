/**
 * Script para forzar la regeneración del archivo JSON con la estructura correcta
 */

const { MongoClient, ObjectId } = require('mongodb');
const fs = require('fs');
const path = require('path');

// Configuración
const ACTIVITY_ID = '686bab150b87c4e4f7f65e66';
const MONGO_URI = 'mongodb://localhost:27017';
const DB_NAME = 'test';
const BELBIN_QUESTIONNAIRE_ID = '6718b2263e29ad19c0e0c61f';

async function forceRegenerateJSON() {
    console.log('🔄 [Force] Forzando regeneración del archivo JSON...');
    console.log(`📋 [Force] Actividad: ${ACTIVITY_ID}`);
    
    let client;
    
    try {
        // 1. Conectar a MongoDB
        console.log('\n=== PASO 1: CONECTANDO A MONGODB ===');
        client = new MongoClient(MONGO_URI);
        await client.connect();
        const db = client.db(DB_NAME);
        console.log('✅ Conectado a MongoDB');
        
        // 2. Obtener actividad
        console.log('\n=== PASO 2: OBTENIENDO ACTIVIDAD ===');
        const activity = await db.collection('activities').findOne({ 
            _id: new ObjectId(ACTIVITY_ID) 
        });
        
        if (!activity) {
            throw new Error('Actividad no encontrada');
        }
        
        console.log(`✅ Actividad encontrada: "${activity.title}"`);
        console.log(`👥 Estudiantes: ${activity.students.length}`);
        
        // 3. Obtener estudiantes con BELBIN
        console.log('\n=== PASO 3: OBTENIENDO ESTUDIANTES CON BELBIN ===');
        const students = await db.collection('users').find({
            _id: { $in: activity.students },
            "askedQuestionnaires": {
                $elemMatch: {
                    "questionnaire": new ObjectId(BELBIN_QUESTIONNAIRE_ID),
                    "result": { $in: ["TW", "CW", "CH", "ME", "CF", "SH", "PL", "RI"] }
                }
            }
        }).toArray();
        
        console.log(`✅ Estudiantes con BELBIN: ${students.length}`);
        
        // 4. CREAR ESTRUCTURA CORRECTA (sin IDs en members)
        console.log('\n=== PASO 4: CREANDO ESTRUCTURA CORRECTA ===');
        
        const algorithmData = {
            number_members: students.length,  // TOTAL de estudiantes, no tamaño del equipo
            members: students.map(student => {
                const belbinResult = student.askedQuestionnaires.find(q => 
                    q.questionnaire.toString() === BELBIN_QUESTIONNAIRE_ID
                );
                return {
                    traits: [belbinResult.result]  // SIN id, solo traits
                };
            }),
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
                    team_size: 3,  // Tamaño de cada equipo
                    min: 1,
                    max: Math.ceil(students.length / 3)  // Máximo número de equipos posibles
                }
            ],
            traits: ["TW", "CW", "CH", "ME", "CF", "SH", "PL", "RI"],
            problem_type: "TraitTeamFormation"
        };
        
        console.log('✅ Estructura JSON creada:');
        console.log(`   - Total miembros: ${algorithmData.number_members}`);
        console.log(`   - Members array: ${algorithmData.members.length} elementos SIN IDs`);
        console.log(`   - Tamaño equipo: ${algorithmData.constraints[2].team_size}`);
        console.log(`   - Máximo equipos: ${algorithmData.constraints[2].max}`);
        
        // 5. Escribir archivo JSON
        console.log('\n=== PASO 5: ESCRIBIENDO ARCHIVO JSON ===');
        const jsonFileName = `activity_${ACTIVITY_ID}_belbin.json`;
        const instancesDir = path.join(__dirname, '../pyteamformation/instances');
        const jsonFilePath = path.join(instancesDir, jsonFileName);
        
        // Crear directorio si no existe
        if (!fs.existsSync(instancesDir)) {
            fs.mkdirSync(instancesDir, { recursive: true });
            console.log('📁 Directorio instances creado');
        }
        
        // Escribir archivo
        fs.writeFileSync(jsonFilePath, JSON.stringify(algorithmData, null, 2));
        console.log(`✅ Archivo JSON regenerado: ${jsonFileName}`);
        
        // 6. Actualizar estado de actividad
        console.log('\n=== PASO 6: ACTUALIZANDO ESTADO DE ACTIVIDAD ===');
        await db.collection('activities').updateOne(
            { _id: new ObjectId(ACTIVITY_ID) },
            { 
                $set: { 
                    "algorithm.status": "ready",
                    "algorithm.configured": true,
                    "algorithm.lastUpdate": new Date()
                }
            }
        );
        console.log('✅ Estado de actividad actualizado a "ready"');
        
        console.log('\n🎉 ¡REGENERACIÓN COMPLETA!');
        console.log('💡 El archivo JSON ahora tiene la estructura correcta esperada por Python');
        
    } catch (error) {
        console.error('💥 Error:', error.message);
    } finally {
        if (client) {
            await client.close();
            console.log('🔐 Conexión MongoDB cerrada');
        }
    }
}

// Ejecutar script
forceRegenerateJSON(); 