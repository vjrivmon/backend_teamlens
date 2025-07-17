import nodemailer from "nodemailer";
import Mail from "nodemailer/lib/mailer";
import fs from "fs";
import path from "path";

/**
 * Servicio de Email para TeamLens - Versión Profesional
 * Sistema completo de emails con templates HTML y configuración dinámica de URLs
 * Implementa mejores prácticas de la industria para comunicación corporativa
 * 
 * @author TeamLens DevOps Team
 * @version 2.0.0
 */

interface EmailResult {
    success: boolean;
    messageId?: string;
    error?: string;
    debugInfo?: any;
}

/**
 * Configuración de URLs dinámicas para diferentes entornos
 * Permite transición seamless entre desarrollo y producción
 */
interface UrlConfig {
    frontend: string;
    login: string;
    register: string;
    resetPassword: string;
    questionnaire: string;
}

class EmailService {
    private isProduction: boolean;
    private emailConfig: any;
    private urlConfig: UrlConfig;
    private templatesPath: string;

    constructor() {
        this.isProduction = process.env.NODE_ENV === 'production';
        this.emailConfig = {
            host: 'smtp.gmail.com',
            port: 465,
            secure: true,
            user: process.env.EMAIL_USER || "teamlens.app@gmail.com",
            password: process.env.EMAIL_PASSWORD || "wobx oabi gxiw nlco",
            from: "teamlens.app@gmail.com"
        };
        
        // Configuración dinámica de URLs basada en variables de entorno
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:4200';
        this.urlConfig = {
            frontend: frontendUrl,
            login: `${frontendUrl}/login`,
            register: `${frontendUrl}/register`,
            resetPassword: `${frontendUrl}/reset-password`,
            questionnaire: `${frontendUrl}/questionnaire`
        };
        
        // Ruta a los templates de email
        this.templatesPath = path.join(__dirname, '..', 'templates', 'emails');
        
        console.log('📧 [EmailService] Inicializando servicio de email profesional v2.0...');
        console.log(`📧 [EmailService] Entorno: ${this.isProduction ? 'PRODUCCIÓN' : 'DESARROLLO'}`);
        console.log(`📧 [EmailService] Usuario configurado: ${this.emailConfig.user}`);
        console.log(`🌐 [EmailService] Frontend URL: ${this.urlConfig.frontend}`);
        console.log(`📁 [EmailService] Templates path: ${this.templatesPath}`);
        
        // ⚠️ VERIFICACIÓN CRÍTICA PARA PRODUCCIÓN
        if (this.isProduction && this.urlConfig.frontend.includes('localhost')) {
            console.error('🚨 [EmailService] ERROR CRÍTICO: Frontend URL contiene localhost en PRODUCCIÓN!');
            console.error(`🚨 [EmailService] URL problemática: ${this.urlConfig.frontend}`);
            console.error('🚨 [EmailService] Verificar variable FRONTEND_URL en .env.production');
        } else if (this.isProduction) {
            console.log(`✅ [EmailService] URL de producción configurada correctamente: ${this.urlConfig.frontend}`);
        }
    }

    /**
     * Crea el transportador de nodemailer
     */
    private async createTransporter() {
        try {
            const transporter = nodemailer.createTransport({
                host: this.emailConfig.host,
                port: this.emailConfig.port,
                secure: this.emailConfig.secure,
                auth: {
                    user: this.emailConfig.user,
                    pass: this.emailConfig.password
                },
                debug: !this.isProduction,
                logger: !this.isProduction
            });

            if (!this.isProduction) {
                console.log('📧 [EmailService] Verificando conexión SMTP...');
                await transporter.verify();
                console.log('✅ [EmailService] Conexión SMTP verificada exitosamente');
            }

            return transporter;
        } catch (error) {
            console.error('❌ [EmailService] Error creando transportador:', error);
            throw error;
        }
    }

    /**
     * Carga un template HTML desde el sistema de archivos
     * @param templateName Nombre del template (sin extensión)
     * @returns Contenido HTML del template
     */
    private loadTemplate(templateName: string): string {
        try {
            const templatePath = path.join(this.templatesPath, `${templateName}.template.html`);
            console.log(`📄 [EmailService] Cargando template: ${templatePath}`);
            
            if (!fs.existsSync(templatePath)) {
                throw new Error(`Template ${templateName} no encontrado en ${templatePath}`);
            }
            
            return fs.readFileSync(templatePath, 'utf-8');
        } catch (error) {
            console.error(`❌ [EmailService] Error cargando template ${templateName}:`, error);
            throw error;
        }
    }

    /**
     * Combina el template base con el contenido específico del email
     * @param content Contenido específico del email
     * @param subject Asunto del email
     * @returns HTML completo del email
     */
    private buildEmailHtml(content: string, subject: string): string {
        try {
            const baseTemplate = this.loadTemplate('base-email');
            
            return baseTemplate
                .replace('{{CONTENT}}', content)
                .replace('{{SUBJECT}}', subject);
        } catch (error) {
            console.error('❌ [EmailService] Error construyendo HTML del email:', error);
            throw error;
        }
    }

    /**
     * Reemplaza variables en un template con valores reales
     * @param template Template con variables {{VARIABLE}}
     * @param variables Objeto con las variables a reemplazar
     * @returns Template con variables reemplazadas
     */
    private replaceTemplateVariables(template: string, variables: Record<string, string>): string {
        let processedTemplate = template;
        
        Object.entries(variables).forEach(([key, value]) => {
            const placeholder = `{{${key}}}`;
            processedTemplate = processedTemplate.replace(new RegExp(placeholder, 'g'), value);
        });
        
        return processedTemplate;
    }

    /**
     * Envía un email con manejo robusto de errores
     */
    public async sendEmail(mailDetails: Mail.Options): Promise<EmailResult> {
        console.log(`📧 [EmailService] Iniciando envío de email a: ${mailDetails.to}`);
        console.log(`📧 [EmailService] Asunto: ${mailDetails.subject}`);

        try {
            // Validar campos requeridos
            if (!mailDetails.to) {
                throw new Error('Destinatario (to) es requerido');
            }
            if (!mailDetails.subject) {
                throw new Error('Asunto (subject) es requerido');
            }
            if (!mailDetails.text && !mailDetails.html) {
                throw new Error('Contenido del email (text o html) es requerido');
            }

            // Configurar campos por defecto
            mailDetails.from = mailDetails.from || this.emailConfig.from;

            // Crear transportador
            const transporter = await this.createTransporter();

            // Enviar email
            console.log(`📤 [EmailService] Enviando email...`);
            const info = await transporter.sendMail(mailDetails);

            console.log(`✅ [EmailService] Email enviado exitosamente!`);
            console.log(`📧 [EmailService] Message ID: ${info.messageId}`);
            
            if (!this.isProduction) {
                console.log(`🔍 [EmailService] Info del envío:`, {
                    messageId: info.messageId,
                    accepted: info.accepted,
                    rejected: info.rejected,
                    response: info.response
                });
            }

            return {
                success: true,
                messageId: info.messageId,
                debugInfo: !this.isProduction ? info : undefined
            };

        } catch (error: any) {
            console.error('❌ [EmailService] Error enviando email:', error);
            
            console.error('❌ [EmailService] Detalles del error:', {
                message: error.message,
                code: error.code,
                command: error.command,
                response: error.response,
                responseCode: error.responseCode
            });

            // En desarrollo, mostrar el contenido del email que falló
            if (!this.isProduction) {
                const textContent = mailDetails.text ? 
                    (typeof mailDetails.text === 'string' ? 
                        mailDetails.text.substring(0, 100) + '...' : 
                        '[contenido no texto]') : 
                    '[sin contenido de texto]';

                console.log('📧 [EmailService] Contenido del email que falló:', {
                    to: mailDetails.to,
                    subject: mailDetails.subject,
                    text: textContent,
                    from: mailDetails.from
                });

                // 🚫 TEMPORALMENTE DESHABILITADO PARA DEBUG: Simular envío exitoso en desarrollo si hay errores de autenticación
                /*
                if (error.code === 'EAUTH' || (error.response && error.response.includes('Invalid login'))) {
                    console.log('🧪 [EmailService] Modo desarrollo: Simulando envío exitoso');
                    console.log('📧 [EmailService] Contenido que se habría enviado:');
                    console.log('  Para:', mailDetails.to);
                    console.log('  Asunto:', mailDetails.subject);
                    console.log('  Contenido:', textContent);
                    
                    return {
                        success: true,
                        messageId: 'dev-simulated-' + Date.now(),
                        debugInfo: { simulated: true, originalError: error.message }
                    };
                }
                */
                
                // 🔧 DEBUGGING: Forzar que se muestre el error real para diagnóstico
                console.log('🚨 [EmailService] MODO DEBUG: Mostrando error real (simulación deshabilitada)');
            }

            return {
                success: false,
                error: error.message,
                debugInfo: !this.isProduction ? error : undefined
            };
        }
    }

    /**
     * Método especializado para enviar email de invitación a estudiantes
     * Utiliza templates profesionales HTML con branding corporativo
     */
    public async sendStudentInvitation(email: string, invitationToken: string): Promise<EmailResult> {
        try {
            const invitationUrl = `${this.urlConfig.register}/${invitationToken}`;
            
            // Cargar template de invitación de estudiantes
            const contentTemplate = this.loadTemplate('student-invitation');
            
            // Reemplazar variables del template
            const processedContent = this.replaceTemplateVariables(contentTemplate, {
                INVITATION_URL: invitationUrl
            });
            
            // Construir HTML completo con template base
            const subject = '🎓 Invitación a TeamLens - Plataforma de Gestión de Equipos';
            const htmlContent = this.buildEmailHtml(processedContent, subject);
            
            const mailDetails: Mail.Options = {
                to: email,
                subject: subject,
                html: htmlContent,
                text: `¡Hola! Has sido invitado a unirte a TeamLens.

Para completar tu registro, visita el siguiente enlace:
${invitationUrl}

Este es un mensaje automático de TeamLens.`
            };

            console.log(`📧 [EmailService] Enviando invitación profesional de estudiante a: ${email}`);
            console.log(`🔗 [EmailService] URL de invitación: ${invitationUrl}`);
            
            return await this.sendEmail(mailDetails);
        } catch (error: any) {
            console.error(`❌ [EmailService] Error enviando invitación de estudiante:`, error);
            throw error;
        }
    }

    /**
     * Envía email de recuperación de contraseña con template profesional
     * @param email Email del usuario
     * @param resetToken Token de reset
     * @returns Resultado del envío
     */
    public async sendForgotPassword(email: string, resetToken: string): Promise<EmailResult> {
        try {
            const resetUrl = `${this.urlConfig.resetPassword}/${resetToken}`;
            
            // Cargar template de recuperación de contraseña
            const contentTemplate = this.loadTemplate('forgot-password');
            
            // Reemplazar variables del template
            const processedContent = this.replaceTemplateVariables(contentTemplate, {
                RESET_URL: resetUrl
            });
            
            // Construir HTML completo con template base
            const subject = '🔐 Recuperación de Contraseña - TeamLens';
            const htmlContent = this.buildEmailHtml(processedContent, subject);
            
            const mailDetails: Mail.Options = {
                to: email,
                subject: subject,
                html: htmlContent,
                text: `Hemos recibido una solicitud para restablecer la contraseña de tu cuenta en TeamLens.

Para crear una nueva contraseña, visita el siguiente enlace (válido por 5 minutos):
${resetUrl}

Si no solicitaste este cambio, puedes ignorar este correo de forma segura.

Este es un mensaje automático de TeamLens.`
            };

            console.log(`📧 [EmailService] Enviando email de recuperación de contraseña a: ${email}`);
            console.log(`🔗 [EmailService] URL de reset: ${resetUrl}`);
            
            return await this.sendEmail(mailDetails);
        } catch (error: any) {
            console.error(`❌ [EmailService] Error enviando email de recuperación:`, error);
            throw error;
        }
    }

    /**
     * Envía confirmación de que la contraseña fue restablecida exitosamente
     * @param email Email del usuario
     * @returns Resultado del envío
     */
    public async sendPasswordResetConfirmation(email: string): Promise<EmailResult> {
        try {
            const loginUrl = this.urlConfig.login;
            
            // Cargar template de confirmación de reset
            const contentTemplate = this.loadTemplate('password-reset-confirmation');
            
            // Reemplazar variables del template
            const processedContent = this.replaceTemplateVariables(contentTemplate, {
                LOGIN_URL: loginUrl
            });
            
            // Construir HTML completo con template base
            const subject = '✅ Contraseña Restablecida - TeamLens';
            const htmlContent = this.buildEmailHtml(processedContent, subject);
            
            const mailDetails: Mail.Options = {
                to: email,
                subject: subject,
                html: htmlContent,
                text: `Tu contraseña en TeamLens ha sido restablecida exitosamente.

Ahora puedes acceder a tu cuenta con tu nueva contraseña en:
${loginUrl}

Por seguridad, todas las sesiones activas han sido cerradas automáticamente.

Si no realizaste esta acción, contacta inmediatamente a tu administrador del sistema.

Este es un mensaje automático de TeamLens.`
            };

            console.log(`📧 [EmailService] Enviando confirmación de reset de contraseña a: ${email}`);
            
            return await this.sendEmail(mailDetails);
        } catch (error: any) {
            console.error(`❌ [EmailService] Error enviando confirmación de reset:`, error);
            throw error;
        }
    }

    /**
     * Envía recordatorio de cuestionario pendiente con template profesional
     * @param email Email del estudiante
     * @param questionnaireId ID del cuestionario
     * @returns Resultado del envío
     */
    public async sendQuestionnaireReminder(email: string, questionnaireId: string): Promise<EmailResult> {
        try {
            // Crear URL con email como parámetro para acceso anónimo directo
            const questionnaireUrl = `${this.urlConfig.questionnaire}/${questionnaireId}?email=${encodeURIComponent(email)}`;
            
            console.log(`📧 [EmailService] Generando enlace con email pre-completado: ${questionnaireUrl}`);
            
            // Cargar template de recordatorio de cuestionario
            const contentTemplate = this.loadTemplate('questionnaire-reminder');
            
            // Reemplazar variables del template
            const processedContent = this.replaceTemplateVariables(contentTemplate, {
                QUESTIONNAIRE_URL: questionnaireUrl
            });
            
            // Construir HTML completo con template base
            const subject = '📋 Cuestionario Pendiente - Acción Requerida - TeamLens';
            const htmlContent = this.buildEmailHtml(processedContent, subject);
            
            const mailDetails: Mail.Options = {
                to: email,
                subject: subject,
                html: htmlContent,
                text: `Tu profesor ha solicitado que completes un cuestionario importante en TeamLens.

Para acceder al cuestionario y completarlo, visita:
${questionnaireUrl}

Esta evaluación es fundamental para la formación de equipos equilibrados en tus próximas actividades académicas.

Duración aproximada: 10-15 minutos
Tu participación en las actividades del curso puede depender de completar este cuestionario.

IMPORTANTE: Tu email (${email}) se incluye automáticamente en el enlace para tu comodidad.

Este es un mensaje automático de TeamLens.`
            };

            console.log(`📧 [EmailService] Enviando recordatorio de cuestionario a: ${email}`);
            console.log(`🔗 [EmailService] URL del cuestionario con email: ${questionnaireUrl}`);
            
            return await this.sendEmail(mailDetails);
        } catch (error: any) {
            console.error(`❌ [EmailService] Error enviando recordatorio de cuestionario:`, error);
            throw error;
        }
    }
}

// Exportar instancia singleton con todas las funcionalidades profesionales
const emailService = new EmailService();

/**
 * API pública del servicio de email con funcionalidades empresariales
 * Proporciona métodos especializados para diferentes tipos de comunicación
 */
export default { 
    // Método genérico para envío de emails
    sendEmail: (mailDetails: Mail.Options) => emailService.sendEmail(mailDetails),
    
    // Métodos especializados con templates profesionales
    sendStudentInvitation: (email: string, token: string) => emailService.sendStudentInvitation(email, token),
    sendForgotPassword: (email: string, resetToken: string) => emailService.sendForgotPassword(email, resetToken),
    sendPasswordResetConfirmation: (email: string) => emailService.sendPasswordResetConfirmation(email),
    sendQuestionnaireReminder: (email: string, questionnaireId: string) => emailService.sendQuestionnaireReminder(email, questionnaireId)
};