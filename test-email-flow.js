/**
 * Test Script - Flujo de Invitación de Estudiantes
 * Verifica que el sistema de emails funcione correctamente
 * 
 * @author TeamLens DevOps Team
 * @version 1.0.0
 */

const nodemailer = require('nodemailer');
const jwt = require('jsonwebtoken');

// Configuración desde .env-dev
const emailConfig = {
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    user: "teamlens.app@gmail.com",
    password: "wobx oabi gxiw nlco"
};

const frontendUrl = 'http://localhost:4200';
const jwtSecret = 'jwt-secret-key';

/**
 * Prueba de conectividad SMTP
 */
async function testSMTPConnection() {
    console.log('🔍 [Test] Verificando conexión SMTP...');
    
    try {
        const transporter = nodemailer.createTransporter({
            host: emailConfig.host,
            port: emailConfig.port,
            secure: emailConfig.secure,
            auth: {
                user: emailConfig.user,
                pass: emailConfig.password
            }
        });

        await transporter.verify();
        console.log('✅ [Test] Conexión SMTP exitosa');
        return true;
    } catch (error) {
        console.error('❌ [Test] Error de conexión SMTP:', error.message);
        return false;
    }
}

/**
 * Genera un token de invitación de prueba
 */
function generateTestToken(email) {
    console.log(`🎫 [Test] Generando token para: ${email}`);
    
    const token = jwt.sign(
        { 
            email: email, 
            type: 'invitation',
            createdAt: Date.now()
        }, 
        jwtSecret,
        { expiresIn: '7d' }
    );
    
    console.log(`✅ [Test] Token generado exitosamente`);
    return token;
}

/**
 * Simula el envío de email de invitación
 */
async function testInvitationEmail(testEmail) {
    console.log(`📧 [Test] Probando envío de invitación a: ${testEmail}`);
    
    // Generar token
    const token = generateTestToken(testEmail);
    const invitationUrl = `${frontendUrl}/register/${token}`;
    
    console.log(`🔗 [Test] URL de invitación: ${invitationUrl}`);
    
    try {
        const transporter = nodemailer.createTransporter({
            host: emailConfig.host,
            port: emailConfig.port,
            secure: emailConfig.secure,
            auth: {
                user: emailConfig.user,
                pass: emailConfig.password
            }
        });

        const mailOptions = {
            from: emailConfig.user,
            to: testEmail,
            subject: '🧪 [TEST] Invitación a TeamLens - Prueba de Sistema',
            html: `
                <h2>🧪 Prueba del Sistema de Invitaciones</h2>
                <p>Este es un email de prueba para verificar el flujo de invitaciones.</p>
                <p><strong>Email de destino:</strong> ${testEmail}</p>
                <p><strong>URL de registro:</strong></p>
                <a href="${invitationUrl}" style="background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
                    Completar Registro
                </a>
                <hr>
                <p><small>Token: ${token.substring(0, 20)}...</small></p>
            `,
            text: `
                Prueba del Sistema de Invitaciones
                
                Email: ${testEmail}
                URL: ${invitationUrl}
                Token: ${token.substring(0, 20)}...
            `
        };

        const info = await transporter.sendMail(mailOptions);
        
        console.log('✅ [Test] Email enviado exitosamente!');
        console.log(`📧 [Test] Message ID: ${info.messageId}`);
        console.log(`📋 [Test] Detalles:`, {
            accepted: info.accepted,
            rejected: info.rejected
        });
        
        return true;
    } catch (error) {
        console.error('❌ [Test] Error enviando email:', error.message);
        return false;
    }
}

/**
 * Verifica que el token se puede decodificar
 */
function testTokenDecoding(token) {
    console.log('🔍 [Test] Verificando decodificación de token...');
    
    try {
        const decoded = jwt.verify(token, jwtSecret);
        console.log('✅ [Test] Token decodificado exitosamente:', {
            email: decoded.email,
            type: decoded.type,
            exp: new Date(decoded.exp * 1000).toISOString()
        });
        return true;
    } catch (error) {
        console.error('❌ [Test] Error decodificando token:', error.message);
        return false;
    }
}

/**
 * Ejecuta todas las pruebas
 */
async function runAllTests() {
    console.log('🚀 [Test] Iniciando pruebas del sistema de invitaciones...\n');
    
    const testEmail = 'test.invitation@gmail.com'; // Cambiar por un email real para pruebas
    
    // 1. Verificar conexión SMTP
    const smtpOk = await testSMTPConnection();
    if (!smtpOk) {
        console.log('🚨 [Test] Las pruebas no pueden continuar sin conexión SMTP');
        return;
    }
    
    console.log('');
    
    // 2. Generar y verificar token
    const token = generateTestToken(testEmail);
    const tokenOk = testTokenDecoding(token);
    
    console.log('');
    
    // 3. Enviar email de prueba
    if (tokenOk) {
        const emailOk = await testInvitationEmail(testEmail);
        
        console.log('\n📊 [Test] Resumen de Resultados:');
        console.log(`  ✅ Conexión SMTP: ${smtpOk ? 'OK' : 'FALLO'}`);
        console.log(`  ✅ Generación Token: ${tokenOk ? 'OK' : 'FALLO'}`);
        console.log(`  ✅ Envío Email: ${emailOk ? 'OK' : 'FALLO'}`);
        
        if (smtpOk && tokenOk && emailOk) {
            console.log('\n🎉 [Test] ¡Todos los tests pasaron! El sistema de invitaciones está funcionando.');
        } else {
            console.log('\n🚨 [Test] Algunos tests fallaron. Revisar configuración.');
        }
    }
}

// Ejecutar tests
if (require.main === module) {
    runAllTests().catch(console.error);
}

module.exports = {
    testSMTPConnection,
    generateTestToken,
    testInvitationEmail,
    testTokenDecoding,
    runAllTests
}; 