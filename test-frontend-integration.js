const axios = require('axios');

async function testFrontendIntegration() {
    console.log('🧪 ==========================================');
    console.log('🧪 TESTING INTEGRACIÓN FRONTEND CORREGIDA');
    console.log('🧪 ==========================================');

    const activityId = '686bab150b87c4e4f7f65e66';
    const baseURL = 'http://localhost:3000';

    // Simular datos exactos que envía el frontend
    const frontendData = {
        algorithmData: {
            number_members: 5,
            members: [
                { traits: ["SH"] },
                { traits: ["ME"] },
                { traits: ["PL"] },
                { traits: ["CH"] },
                { traits: ["SH"] }
            ],
            agg_func: "sum",
            constraints: [
                {
                    type: "AllAssigned",
                    name: "",
                    number_members: 5
                },
                {
                    type: "NonOverlapping",
                    name: ""
                },
                {
                    type: "SizeCardinality",
                    name: "config_0",
                    team_size: 3,
                    min: 1,
                    max: 2
                }
            ],
            traits: ["TW", "CW", "CH", "ME", "CF", "SH", "PL", "RI"],
            problem_type: "TraitTeamFormation"
        },
        groupConfigurations: [
            {
                minQuantity: 1,
                maxQuantity: 2,
                size: 3,
                id: "config_test_123"
            }
        ],
        restrictions: {
            mustBeTogether: [
                [
                    { _id: "673c9bc9d3c9e4ac1e87a81c", name: "Visi3", email: "vicentino153@gmail.com" },
                    { _id: "673c9bc9d3c9e4ac1e87a81d", name: "Visi", email: "visirivas02@gmail.com" }
                ]
            ],
            mustNotBeTogether: [
                [
                    { _id: "673c9bc9d3c9e4ac1e87a81e", name: "Caballo", email: "culitodecaballo@gmail.com" },
                    { _id: "673c9bc9d3c9e4ac1e87a81f", name: "Unicornio", email: "culitodeunicornio@gmail.com" }
                ],
                [
                    { _id: "673c9bc9d3c9e4ac1e87a820", name: "Seta", email: "sedotcup@gmail.com" },
                    { _id: "673c9bc9d3c9e4ac1e87a81c", name: "Visi3", email: "vicentino153@gmail.com" }
                ]
            ],
            mustBeAGroup: []
        }
    };

    try {
        console.log('📊 Datos de prueba preparados:');
        console.log(`   - Miembros: ${frontendData.algorithmData.number_members}`);
        console.log(`   - Constraints iniciales: ${frontendData.algorithmData.constraints.length}`);
        console.log(`   - Configuraciones: ${frontendData.groupConfigurations.length}`);
        console.log(`   - Must be together: ${frontendData.restrictions.mustBeTogether.length}`);
        console.log(`   - Must NOT be together: ${frontendData.restrictions.mustNotBeTogether.length}`);

        console.log('\n🚀 Enviando solicitud al backend...');
        
        const response = await axios.post(`${baseURL}/activities/${activityId}/algorithm/execute`, frontendData, {
            headers: {
                'Content-Type': 'application/json'
            },
            timeout: 5000
        });

        console.log('\n✅ RESPUESTA DEL BACKEND:');
        console.log('Status:', response.status);
        console.log('Response:', JSON.stringify(response.data, null, 2));

        console.log('\n📂 Verificando archivo JSON generado...');
        const fs = require('fs');
        const path = require('path');
        
        const jsonPath = path.join(__dirname, 'src', 'scripts', 'pyteamformation', 'instances', `activity_${activityId}_belbin.json`);
        
        if (fs.existsSync(jsonPath)) {
            const generatedJSON = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
            
            console.log('\n🎯 ARCHIVO JSON GENERADO:');
            console.log('- Miembros:', generatedJSON.number_members);
            console.log('- Constraints:', generatedJSON.constraints.length);
            
            // Verificar restricciones específicas
            const sameTeamConstraints = generatedJSON.constraints.filter(c => c.type === 'SameTeam');
            const differentTeamConstraints = generatedJSON.constraints.filter(c => c.type === 'DifferentTeam');
            const sizeCardinalityConstraints = generatedJSON.constraints.filter(c => c.type === 'SizeCardinality');
            
            console.log('- SameTeam constraints:', sameTeamConstraints.length);
            console.log('- DifferentTeam constraints:', differentTeamConstraints.length);
            console.log('- SizeCardinality constraints:', sizeCardinalityConstraints.length);
            
            if (sameTeamConstraints.length > 0) {
                console.log('\n✅ Must be together (SameTeam):');
                sameTeamConstraints.forEach((constraint, i) => {
                    console.log(`   ${i + 1}. ${constraint.name}: ${constraint.members}`);
                });
            }
            
            if (differentTeamConstraints.length > 0) {
                console.log('\n🚫 Must NOT be together (DifferentTeam):');
                differentTeamConstraints.forEach((constraint, i) => {
                    console.log(`   ${i + 1}. ${constraint.name}: ${constraint.members}`);
                });
            }
            
            if (sizeCardinalityConstraints.length > 0) {
                console.log('\n📏 Configuración de tamaños:');
                sizeCardinalityConstraints.forEach((constraint, i) => {
                    console.log(`   ${i + 1}. Tamaño: ${constraint.team_size}, Min: ${constraint.min}, Max: ${constraint.max}`);
                });
            }
            
            console.log('\n📄 JSON COMPLETO:');
            console.log(JSON.stringify(generatedJSON, null, 2));
            
        } else {
            console.log('❌ Archivo JSON no encontrado en:', jsonPath);
        }

    } catch (error) {
        console.error('\n❌ ERROR EN EL TEST:');
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', JSON.stringify(error.response.data, null, 2));
        } else {
            console.error('Error:', error.message);
        }
    }

    console.log('\n🧪 ==========================================');
    console.log('🧪 FIN DEL TEST DE INTEGRACIÓN');
    console.log('🧪 ==========================================');
}

// Ejecutar el test
testFrontendIntegration().catch(console.error); 