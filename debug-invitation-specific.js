/**
 * Debug Script - Específico para Invitaciones vs Otros Emails
 * Compara el comportamiento de diferentes tipos de email
 * 
 * @author TeamLens DevOps Team
 * @version 1.0.0
 */

const nodemailer = require('nodemailer');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

// Configuración desde .env-dev
const emailConfig = {
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    user: "teamlens.app@gmail.com",
    password: "wobx oabi gxiw nlco",
    from: "teamlens.app@gmail.com"
};

const frontendUrl = 'http://localhost:4200';
const jwtSecret = 'jwt-secret-key';
const templatesPath = path.join(__dirname, 'src', 'templates', 'emails');

/**
 * Cargar template HTML
 */
function loadTemplate(templateName) {
    try {
        const templatePath = path.join(templatesPath, `${templateName}.template.html`);
        console.log(`📄 [Debug] Cargando template: ${templatePath}`);
        
        if (!fs.existsSync(templatePath)) {
            throw new Error(`Template ${templateName} no encontrado en ${templatePath}`);
        }
        
        return fs.readFileSync(templatePath, 'utf-8');
    } catch (error) {
        console.error(`❌ [Debug] Error cargando template ${templateName}:`, error);
        throw error;
    }
}

/**
 * Reemplazar variables en template
 */
function replaceTemplateVariables(template, variables) {
    let processedTemplate = template;
    
    Object.entries(variables).forEach(([key, value]) => {
        const placeholder = `{{${key}}}`;
        processedTemplate = processedTemplate.replace(new RegExp(placeholder, 'g'), value);
    });
    
    return processedTemplate;
}

/**
 * Construir HTML completo con template base
 */
function buildEmailHtml(content, subject) {
    try {
        const baseTemplate = loadTemplate('base-email');
        
        return baseTemplate
            .replace('{{CONTENT}}', content)
            .replace('{{SUBJECT}}', subject);
    } catch (error) {
        console.error('❌ [Debug] Error construyendo HTML del email:', error);
        throw error;
    }
}

/**
 * Crear transportador de email
 */
async function createTransporter() {
    try {
        const transporter = nodemailer.createTransporter({
            host: emailConfig.host,
            port: emailConfig.port,
            secure: emailConfig.secure,
            auth: {
                user: emailConfig.user,
                pass: emailConfig.password
            },
            debug: true,
            logger: true
        });

        console.log('🔍 [Debug] Verificando conexión SMTP...');
        await transporter.verify();
        console.log('✅ [Debug] Conexión SMTP verificada exitosamente');

        return transporter;
    } catch (error) {
        console.error('❌ [Debug] Error creando transportador:', error);
        throw error;
    }
}

/**
 * Test específico para email de invitación (que no funciona)
 */
async function testStudentInvitation(testEmail) {
    console.log(`\n📧 [Debug] === PROBANDO INVITACIÓN DE ESTUDIANTE ===`);
    console.log(`📧 [Debug] Email destino: ${testEmail}`);
    
    try {
        // Generar token de invitación
        const invitationToken = jwt.sign(
            { 
                email: testEmail, 
                type: 'invitation',
                createdAt: Date.now()
            }, 
            jwtSecret,
            { expiresIn: '7d' }
        );
        
        const invitationUrl = `${frontendUrl}/register/${invitationToken}`;
        console.log(`🔗 [Debug] URL de invitación: ${invitationUrl}`);
        
        // Cargar y procesar template
        const contentTemplate = loadTemplate('student-invitation');
        const processedContent = replaceTemplateVariables(contentTemplate, {
            INVITATION_URL: invitationUrl
        });
        
        const subject = '🎓 [DEBUG] Invitación a TeamLens - Plataforma de Gestión de Equipos';
        const htmlContent = buildEmailHtml(processedContent, subject);
        
        const mailDetails = {
            from: emailConfig.from,
            to: testEmail,
            subject: subject,
            html: htmlContent,
            text: `¡Hola! Has sido invitado a unirte a TeamLens.

Para completar tu registro, visita el siguiente enlace:
${invitationUrl}

Este es un mensaje automático de TeamLens.`
        };

        console.log(`📤 [Debug] Enviando invitación...`);
        console.log(`📋 [Debug] Detalles del email:`, {
            to: mailDetails.to,
            subject: mailDetails.subject,
            htmlLength: mailDetails.html.length,
            textLength: mailDetails.text.length
        });
        
        const transporter = await createTransporter();
        const info = await transporter.sendMail(mailDetails);
        
        console.log(`✅ [Debug] INVITACIÓN enviada exitosamente!`);
        console.log(`📧 [Debug] Message ID: ${info.messageId}`);
        console.log(`📋 [Debug] Info completa:`, info);
        
        return { success: true, info };
    } catch (error) {
        console.error(`❌ [Debug] Error enviando INVITACIÓN:`, error);
        console.error(`❌ [Debug] Código de error:`, error.code);
        console.error(`❌ [Debug] Respuesta del servidor:`, error.response);
        return { success: false, error };
    }
}

/**
 * Test específico para recuperación de contraseña (que funciona)
 */
async function testPasswordRecovery(testEmail) {
    console.log(`\n📧 [Debug] === PROBANDO RECUPERACIÓN DE CONTRASEÑA ===`);
    console.log(`📧 [Debug] Email destino: ${testEmail}`);
    
    try {
        // Generar token de reset
        const resetToken = jwt.sign(
            { email: testEmail },
            jwtSecret,
            { expiresIn: '5m' }
        );
        
        const resetUrl = `${frontendUrl}/reset-password/${resetToken}`;
        console.log(`🔗 [Debug] URL de reset: ${resetUrl}`);
        
        // Cargar y procesar template
        const contentTemplate = loadTemplate('forgot-password');
        const processedContent = replaceTemplateVariables(contentTemplate, {
            RESET_URL: resetUrl
        });
        
        const subject = '🔐 [DEBUG] Recuperación de Contraseña - TeamLens';
        const htmlContent = buildEmailHtml(processedContent, subject);
        
        const mailDetails = {
            from: emailConfig.from,
            to: testEmail,
            subject: subject,
            html: htmlContent,
            text: `Hemos recibido una solicitud para restablecer la contraseña de tu cuenta en TeamLens.

Para crear una nueva contraseña, visita el siguiente enlace (válido por 5 minutos):
${resetUrl}

Si no solicitaste este cambio, puedes ignorar este correo de forma segura.

Este es un mensaje automático de TeamLens.`
        };

        console.log(`📤 [Debug] Enviando recuperación...`);
        console.log(`📋 [Debug] Detalles del email:`, {
            to: mailDetails.to,
            subject: mailDetails.subject,
            htmlLength: mailDetails.html.length,
            textLength: mailDetails.text.length
        });
        
        const transporter = await createTransporter();
        const info = await transporter.sendMail(mailDetails);
        
        console.log(`✅ [Debug] RECUPERACIÓN enviada exitosamente!`);
        console.log(`📧 [Debug] Message ID: ${info.messageId}`);
        console.log(`📋 [Debug] Info completa:`, info);
        
        return { success: true, info };
    } catch (error) {
        console.error(`❌ [Debug] Error enviando RECUPERACIÓN:`, error);
        console.error(`❌ [Debug] Código de error:`, error.code);
        console.error(`❌ [Debug] Respuesta del servidor:`, error.response);
        return { success: false, error };
    }
}

/**
 * Test específico para cuestionario Belbin (que funciona)
 */
async function testBelbinQuestionnaire(testEmail) {
    console.log(`\n📧 [Debug] === PROBANDO CUESTIONARIO BELBIN ===`);
    console.log(`📧 [Debug] Email destino: ${testEmail}`);
    
    try {
        const questionnaireId = '6718b2263e29ad19c0e0c61f'; // ID del cuestionario Belbin
        const questionnaireUrl = `${frontendUrl}/questionnaire/${questionnaireId}?email=${encodeURIComponent(testEmail)}`;
        console.log(`🔗 [Debug] URL de cuestionario: ${questionnaireUrl}`);
        
        // Cargar y procesar template
        const contentTemplate = loadTemplate('questionnaire-reminder');
        const processedContent = replaceTemplateVariables(contentTemplate, {
            QUESTIONNAIRE_URL: questionnaireUrl
        });
        
        const subject = '📋 [DEBUG] Cuestionario Pendiente - Acción Requerida - TeamLens';
        const htmlContent = buildEmailHtml(processedContent, subject);
        
        const mailDetails = {
            from: emailConfig.from,
            to: testEmail,
            subject: subject,
            html: htmlContent,
            text: `Tu profesor ha solicitado que completes un cuestionario importante en TeamLens.

Para acceder al cuestionario y completarlo, visita:
${questionnaireUrl}

Esta evaluación es fundamental para la formación de equipos equilibrados en tus próximas actividades académicas.

Duración aproximada: 10-15 minutos
Tu participación en las actividades del curso puede depender de completar este cuestionario.

IMPORTANTE: Tu email (${testEmail}) se incluye automáticamente en el enlace para tu comodidad.

Este es un mensaje automático de TeamLens.`
        };

        console.log(`📤 [Debug] Enviando cuestionario...`);
        console.log(`📋 [Debug] Detalles del email:`, {
            to: mailDetails.to,
            subject: mailDetails.subject,
            htmlLength: mailDetails.html.length,
            textLength: mailDetails.text.length
        });
        
        const transporter = await createTransporter();
        const info = await transporter.sendMail(mailDetails);
        
        console.log(`✅ [Debug] CUESTIONARIO enviado exitosamente!`);
        console.log(`📧 [Debug] Message ID: ${info.messageId}`);
        console.log(`📋 [Debug] Info completa:`, info);
        
        return { success: true, info };
    } catch (error) {
        console.error(`❌ [Debug] Error enviando CUESTIONARIO:`, error);
        console.error(`❌ [Debug] Código de error:`, error.code);
        console.error(`❌ [Debug] Respuesta del servidor:`, error.response);
        return { success: false, error };
    }
}

/**
 * Ejecutar comparación completa
 */
async function runComparisonTests() {
    console.log('🚀 [Debug] Iniciando comparación de tipos de email...\n');
    
    const testEmail = 'vicenterivas773@gmail.com'; // Cambiar por tu email real
    
    const results = {
        invitation: await testStudentInvitation(testEmail),
        passwordRecovery: await testPasswordRecovery(testEmail),
        belbinQuestionnaire: await testBelbinQuestionnaire(testEmail)
    };
    
    console.log('\n📊 [Debug] === RESUMEN DE RESULTADOS ===');
    console.log(`  📧 Invitación: ${results.invitation.success ? '✅ ÉXITO' : '❌ FALLO'}`);
    console.log(`  🔐 Recuperación: ${results.passwordRecovery.success ? '✅ ÉXITO' : '❌ FALLO'}`);
    console.log(`  📋 Cuestionario: ${results.belbinQuestionnaire.success ? '✅ ÉXITO' : '❌ FALLO'}`);
    
    if (results.invitation.success && results.passwordRecovery.success && results.belbinQuestionnaire.success) {
        console.log('\n🎉 [Debug] ¡Todos los emails funcionan! El problema no es de conectividad.');
    } else {
        console.log('\n🚨 [Debug] Hay problemas específicos con algunos tipos de email.');
        
        if (!results.invitation.success) {
            console.log('❌ [Debug] INVITACIÓN falló:', results.invitation.error?.message);
        }
        if (!results.passwordRecovery.success) {
            console.log('❌ [Debug] RECUPERACIÓN falló:', results.passwordRecovery.error?.message);
        }
        if (!results.belbinQuestionnaire.success) {
            console.log('❌ [Debug] CUESTIONARIO falló:', results.belbinQuestionnaire.error?.message);
        }
    }
    
    return results;
}

// Ejecutar tests
if (require.main === module) {
    runComparisonTests().catch(console.error);
}

module.exports = {
    testStudentInvitation,
    testPasswordRecovery,
    testBelbinQuestionnaire,
    runComparisonTests
}; 