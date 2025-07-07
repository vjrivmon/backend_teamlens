const axios = require('axios');
const { MongoClient, ObjectId } = require('mongodb');

async function testCorrectedSystem() {
    console.log('🧪 ========================================');
    console.log('🧪 TESTING SISTEMA CORREGIDO');
    console.log('🧪 ========================================');

    const activityId = '686bab150b87c4e4f7f65e66';
    const baseURL = 'http://localhost:3000';
    
    // Conectar a MongoDB para obtener estudiantes
    const client = new MongoClient('mongodb://localhost:27017');
    await client.connect();
    const db = client.db('test');
    
    try {
        console.log('📊 Paso 1: Obteniendo estudiantes de la actividad...');
        
        // Obtener la actividad y sus estudiantes
        const activity = await db.collection('activities').findOne({ _id: new ObjectId(activityId) });
        if (!activity) {
            throw new Error('Actividad no encontrada');
        }
        
        console.log(`✅ Actividad encontrada: "${activity.title}"`);
        console.log(`👥 Estudiantes en actividad: ${activity.students.length}`);
        
        // Simular que el profesor selecciona los primeros 5 estudiantes
        const selectedStudentIds = activity.students.slice(0, 5).map(id => id.toString());
        
        console.log('📊 Paso 2: Construyendo datos del algoritmo (como frontend corregido)...');
        
        // Simular exactamente lo que envía el frontend corregido
        const algorithmData = {
            number_members: selectedStudentIds.length,
            members: [], // El frontend ya NO envía members - el backend los obtendrá
            agg_func: "sum",
            constraints: [
                {
                    type: "AllAssigned",
                    name: "",
                    number_members: selectedStudentIds.length
                },
                {
                    type: "NonOverlapping", 
                    name: ""
                },
                {
                    type: "SizeCardinality",
                    name: "config_0", 
                    team_size: 2,    // Grupos de 2 personas
                    min: 2,          // Mínimo 2 grupos
                    max: 3           // Máximo 3 grupos
                }
            ],
            traits: ["TW", "CW", "CH", "ME", "CF", "SH", "PL", "RI"],
            problem_type: "TraitTeamFormation"
        };

        const requestData = {
            algorithmData: algorithmData,
            selectedStudentIds: selectedStudentIds, // ← CLAVE: IDs para que backend obtenga traits
            groupConfigurations: [
                {
                    minQuantity: 2,
                    maxQuantity: 3,
                    size: 2,
                    id: "config_test"
                }
            ],
            restrictions: {
                mustBeTogether: [],
                mustNotBeTogether: [
                    // Simular restricción: dos estudiantes NO deben ir juntos
                    [selectedStudentIds[0], selectedStudentIds[1]]  
                ]
            }
        };

        console.log('📋 Datos a enviar:', {
            estudiantes: selectedStudentIds.length,
            selectedStudentIds: selectedStudentIds,
            membersEnviados: algorithmData.members.length,
            constraintsIniciales: algorithmData.constraints.length,
            configuraciones: requestData.groupConfigurations.length,
            restricciones: Object.keys(requestData.restrictions).length
        });

        console.log('📊 Paso 3: Enviando request al backend...');

        // Realizar la llamada al endpoint corregido SIN autenticación (para testing)
        const response = await axios.post(
            `${baseURL}/debug/activities/${activityId}/algorithm/test`,
            requestData,
            {
                headers: {
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            }
        );

        console.log('✅ Respuesta del backend:');
        console.log(`📊 Status: ${response.status}`);
        console.log(`📋 Data:`, response.data);

        console.log('📊 Paso 4: Verificando archivo JSON generado...');
        
        // Verificar si se generó el archivo JSON correctamente
        const fs = require('fs');
        const path = require('path');
        const jsonPath = path.join(__dirname, '../pyteamformation/instances', `activity_${activityId}_belbin.json`);
        
        if (fs.existsSync(jsonPath)) {
            const jsonContent = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
            console.log('✅ Archivo JSON generado correctamente:');
            console.log(`📊 - Miembros: ${jsonContent.number_members}`);
            console.log(`📊 - Members array length: ${jsonContent.members.length}`);
            console.log(`📊 - Constraints: ${jsonContent.constraints.length}`);
            
            // Verificar que los members tienen traits (no vacíos)
            const membersWithTraits = jsonContent.members.filter(m => m.traits && m.traits.length > 0);
            console.log(`📊 - Members con traits: ${membersWithTraits.length}/${jsonContent.members.length}`);
            
            // Verificar que NO hay IDs en members
            const membersWithIds = jsonContent.members.filter(m => m.id !== undefined);
            console.log(`📊 - Members con IDs: ${membersWithIds.length} (debe ser 0)`);
            
            if (membersWithTraits.length === jsonContent.members.length && membersWithIds.length === 0) {
                console.log('🎉 ¡JSON CORRECTO! Traits obtenidos sin IDs');
            } else {
                console.log('❌ JSON con problemas: traits vacíos o IDs presentes');
            }
            
            // Mostrar sample de traits
            console.log('📋 Sample de traits:', jsonContent.members.slice(0, 3));
            
        } else {
            console.log('❌ Archivo JSON no encontrado');
        }

    } catch (error) {
        console.error('❌ ERROR EN EL TEST:');
        if (error.response) {
            console.error(`📊 Status: ${error.response.status}`);
            console.error(`📋 Data:`, error.response.data);
        } else {
            console.error('📋 Error:', error.message);
        }
    } finally {
        await client.close();
    }

    console.log('🧪 ========================================');
    console.log('🧪 FIN DEL TEST DEL SISTEMA CORREGIDO');
    console.log('🧪 ========================================');
}

// Ejecutar el test
testCorrectedSystem().catch(console.error); 