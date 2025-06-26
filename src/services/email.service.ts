import nodemailer from "nodemailer";
import Mail from "nodemailer/lib/mailer";

/**
 * Servicio de Email para TeamLens - Versión Corregida
 * Maneja el envío de correos electrónicos sin errores de compilación
 */

interface EmailResult {
    success: boolean;
    messageId?: string;
    error?: string;
    debugInfo?: any;
}

class EmailService {
    private isProduction: boolean;
    private emailConfig: any;

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
        
        console.log('📧 [EmailService] Inicializando servicio de email...');
        console.log(`📧 [EmailService] Entorno: ${this.isProduction ? 'PRODUCCIÓN' : 'DESARROLLO'}`);
        console.log(`📧 [EmailService] Usuario configurado: ${this.emailConfig.user}`);
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

                // Simular envío exitoso en desarrollo si hay errores de autenticación
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
     */
    public async sendStudentInvitation(email: string, invitationToken: string): Promise<EmailResult> {
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:4200';
        const invitationUrl = `${frontendUrl}/register/${invitationToken}`;

        const mailDetails: Mail.Options = {
            to: email,
            subject: '🎓 Invitación a TeamLens - Plataforma de Gestión de Equipos',
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <title>Invitación a TeamLens</title>
                </head>
                <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                    <div style="max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
                        <div style="background-color: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                            <h1 style="color: #2c3e50; text-align: center; margin-bottom: 30px;">
                                🎓 Bienvenido a TeamLens
                            </h1>
                            
                            <p style="font-size: 16px; margin-bottom: 20px;">
                                ¡Hola! Has sido invitado a unirte a <strong>TeamLens</strong>, 
                                nuestra plataforma de gestión de equipos educativos.
                            </p>
                            
                            <p style="font-size: 16px; margin-bottom: 30px;">
                                Para completar tu registro y acceder a la plataforma, 
                                haz clic en el siguiente botón:
                            </p>
                            
                            <div style="text-align: center; margin-bottom: 30px;">
                                <a href="${invitationUrl}" 
                                   style="background-color: #3498db; color: white; padding: 12px 30px; 
                                          text-decoration: none; border-radius: 5px; font-weight: bold; 
                                          display: inline-block;">
                                    Completar Registro
                                </a>
                            </div>
                            
                            <p style="font-size: 14px; color: #666; margin-bottom: 20px;">
                                Si el botón no funciona, copia y pega la siguiente URL en tu navegador:
                            </p>
                            
                            <p style="font-size: 12px; color: #999; background-color: #f8f9fa; 
                                      padding: 10px; border-radius: 4px; word-break: break-all;">
                                ${invitationUrl}
                            </p>
                            
                            <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
                            
                            <p style="font-size: 12px; color: #999; text-align: center;">
                                Este es un mensaje automático de TeamLens. No respondas a este email.
                            </p>
                        </div>
                    </div>
                </body>
                </html>
            `,
            text: `¡Hola! Has sido invitado a unirte a TeamLens.

Para completar tu registro, visita el siguiente enlace:
${invitationUrl}

Este es un mensaje automático de TeamLens.`
        };

        console.log(`📧 [EmailService] Enviando invitación de estudiante a: ${email}`);
        return await this.sendEmail(mailDetails);
    }
}

// Exportar instancia singleton
const emailService = new EmailService();

export default { 
    sendEmail: (mailDetails: Mail.Options) => emailService.sendEmail(mailDetails),
    sendStudentInvitation: (email: string, token: string) => emailService.sendStudentInvitation(email, token)
};