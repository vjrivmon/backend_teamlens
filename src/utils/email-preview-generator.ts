import fs from 'fs';
import path from 'path';

/**
 * Generador de previews de emails para verificación y aprobación
 * Permite visualizar los templates mejorados antes de implementarlos en producción
 */
export class EmailPreviewGenerator {
    private templatesPath: string;
    private outputPath: string;

    constructor() {
        this.templatesPath = path.join(__dirname, '../templates/emails');
        this.outputPath = path.join(__dirname, '../../email-previews');
        this.ensureOutputDirectory();
    }

    private ensureOutputDirectory(): void {
        if (!fs.existsSync(this.outputPath)) {
            fs.mkdirSync(this.outputPath, { recursive: true });
        }
    }

    /**
     * Genera previews de todos los templates mejorados con datos de ejemplo
     */
    async generateAllPreviews(): Promise<void> {
        console.log('🎨 Generando previews de templates de email...');

        try {
            // Preview para invitación de estudiante
            await this.generateStudentInvitationPreview();

            // Preview para recordatorio de cuestionario
            await this.generateQuestionnaireReminderPreview();

            // Preview para reset de contraseña
            await this.generatePasswordResetPreview();

            // Preview para confirmación de reset
            await this.generatePasswordResetConfirmationPreview();

            console.log('✅ Todos los previews generados exitosamente');
            console.log(`📁 Archivos disponibles en: ${this.outputPath}`);

        } catch (error) {
            console.error('❌ Error generando previews:', error);
            throw error;
        }
    }

    /**
     * Genera preview de invitación de estudiante
     */
    private async generateStudentInvitationPreview(): Promise<void> {
        const baseTemplate = this.loadTemplate('base-email-enhanced.template.html');
        const contentTemplate = this.loadTemplate('student-invitation-enhanced.template.html');

        const sampleData = {
            SUBJECT: 'Invitación a TeamLens - Plataforma Educativa',
            INVITATION_URL: 'https://teamlens.universidad.edu/invitation/abc123def456',
            CONTENT: contentTemplate.replace(/{{INVITATION_URL}}/g, 'https://teamlens.universidad.edu/invitation/abc123def456')
        };

        const finalHtml = this.processTemplate(baseTemplate, sampleData);

        fs.writeFileSync(
            path.join(this.outputPath, 'student-invitation-preview.html'),
            finalHtml
        );

        console.log('✅ Preview generado: student-invitation-preview.html');
    }

    /**
     * Genera preview de recordatorio de cuestionario
     */
    private async generateQuestionnaireReminderPreview(): Promise<void> {
        const baseTemplate = this.loadTemplate('base-email-enhanced.template.html');
        const contentTemplate = this.loadTemplate('questionnaire-reminder-enhanced.template.html');

        const sampleData = {
            SUBJECT: 'Cuestionario Belbin Pendiente - Acción Requerida',
            QUESTIONNAIRE_URL: 'https://teamlens.universidad.edu/questionnaire/belbin/xyz789abc123',
            CONTENT: contentTemplate.replace(/{{QUESTIONNAIRE_URL}}/g, 'https://teamlens.universidad.edu/questionnaire/belbin/xyz789abc123')
        };

        const finalHtml = this.processTemplate(baseTemplate, sampleData);

        fs.writeFileSync(
            path.join(this.outputPath, 'questionnaire-reminder-preview.html'),
            finalHtml
        );

        console.log('✅ Preview generado: questionnaire-reminder-preview.html');
    }

    /**
     * Genera preview de reset de contraseña
     */
    private async generatePasswordResetPreview(): Promise<void> {
        const baseTemplate = this.loadTemplate('base-email-enhanced.template.html');
        const contentTemplate = this.loadTemplate('forgot-password-enhanced.template.html');

        const sampleData = {
            SUBJECT: 'Solicitud de Restablecimiento de Contraseña - TeamLens',
            RESET_URL: 'https://teamlens.universidad.edu/reset-password/token123abc456def',
            CONTENT: contentTemplate.replace(/{{RESET_URL}}/g, 'https://teamlens.universidad.edu/reset-password/token123abc456def')
        };

        const finalHtml = this.processTemplate(baseTemplate, sampleData);

        fs.writeFileSync(
            path.join(this.outputPath, 'password-reset-preview.html'),
            finalHtml
        );

        console.log('✅ Preview generado: password-reset-preview.html');
    }

    /**
     * Genera preview de confirmación de reset
     */
    private async generatePasswordResetConfirmationPreview(): Promise<void> {
        const baseTemplate = this.loadTemplate('base-email-enhanced.template.html');
        const contentTemplate = this.loadTemplate('password-reset-confirmation-enhanced.template.html');

        const currentDate = new Date().toLocaleString('es-ES', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZoneName: 'short'
        });

        const sampleData = {
            SUBJECT: 'Confirmación: Contraseña Restablecida - TeamLens',
            LOGIN_URL: 'https://teamlens.universidad.edu/login',
            RESET_TIMESTAMP: currentDate,
            CONTENT: contentTemplate
                .replace(/{{LOGIN_URL}}/g, 'https://teamlens.universidad.edu/login')
                .replace(/{{RESET_TIMESTAMP}}/g, currentDate)
        };

        const finalHtml = this.processTemplate(baseTemplate, sampleData);

        fs.writeFileSync(
            path.join(this.outputPath, 'password-reset-confirmation-preview.html'),
            finalHtml
        );

        console.log('✅ Preview generado: password-reset-confirmation-preview.html');
    }

    /**
     * Carga un template desde el sistema de archivos
     */
    private loadTemplate(templateName: string): string {
        try {
            const templatePath = path.join(this.templatesPath, templateName);
            return fs.readFileSync(templatePath, 'utf-8');
        } catch (error) {
            console.error(`❌ Error cargando template ${templateName}:`, error);
            throw error;
        }
    }

    /**
     * Procesa un template reemplazando variables
     */
    private processTemplate(template: string, data: Record<string, string>): string {
        let processed = template;

        Object.entries(data).forEach(([key, value]) => {
            const regex = new RegExp(`{{${key}}}`, 'g');
            processed = processed.replace(regex, value);
        });

        return processed;
    }

    /**
     * Genera reporte de comparación entre templates originales y mejorados
     */
    async generateComparisonReport(): Promise<void> {
        const report = {
            timestamp: new Date().toISOString(),
            improvements: [
                {
                    category: 'Accesibilidad',
                    changes: [
                        'Contraste de colores WCAG AA compliant',
                        'Estructura semántica mejorada con ARIA',
                        'Soporte para lectores de pantalla',
                        'Texto alternativo para elementos visuales'
                    ]
                },
                {
                    category: 'Compatibilidad',
                    changes: [
                        'Layout basado en tablas para máxima compatibilidad',
                        'Fallbacks VML para Outlook',
                        'CSS inline para mejor renderizado',
                        'Soporte para 15+ clientes de email'
                    ]
                },
                {
                    category: 'Diseño Moderno',
                    changes: [
                        'Tipografía Inter para mejor legibilidad',
                        'Sistema de colores profesional consistente',
                        'Cards informativas con iconos',
                        'Estadísticas visuales atractivas'
                    ]
                },
                {
                    category: 'Funcionalidad',
                    changes: [
                        'Soporte para modo oscuro',
                        'Botones optimizados para dispositivos táctiles',
                        'URLs de fallback para todos los enlaces',
                        'Información de seguridad prominente'
                    ]
                },
                {
                    category: 'Experiencia de Usuario',
                    changes: [
                        'Pasos claramente definidos',
                        'Información contextual relevante',
                        'Advertencias de seguridad visibles',
                        'CTAs más prominentes y efectivos'
                    ]
                }
            ],
            templates: [
                {
                    name: 'Base Template',
                    file: 'base-email-enhanced.template.html',
                    improvements: 'Estructura completa renovada con soporte para modo oscuro'
                },
                {
                    name: 'Student Invitation',
                    file: 'student-invitation-enhanced.template.html',
                    improvements: 'Proceso de onboarding paso a paso con beneficios visuales'
                },
                {
                    name: 'Questionnaire Reminder',
                    file: 'questionnaire-reminder-enhanced.template.html',
                    improvements: 'Información educativa sobre Belbin con estadísticas visuales'
                },
                {
                    name: 'Password Reset',
                    file: 'forgot-password-enhanced.template.html',
                    improvements: 'Contador de tiempo y medidas de seguridad prominentes'
                },
                {
                    name: 'Reset Confirmation',
                    file: 'password-reset-confirmation-enhanced.template.html',
                    improvements: 'Confirmación visual y próximos pasos claros'
                }
            ]
        };

        fs.writeFileSync(
            path.join(this.outputPath, 'improvement-report.json'),
            JSON.stringify(report, null, 2)
        );

        console.log('📊 Reporte de mejoras generado: improvement-report.json');
    }

    /**
     * Genera checklist de verificación para aprobación
     */
    async generateApprovalChecklist(): Promise<void> {
        const checklist = {
            title: 'Lista de Verificación - Templates de Email Mejorados',
            version: '2.0',
            date: new Date().toLocaleDateString('es-ES'),
            categories: [
                {
                    name: '🎨 Diseño Visual',
                    items: [
                        'Colores consistentes con la marca TeamLens',
                        'Tipografía legible y profesional',
                        'Espaciado y layout equilibrado',
                        'Iconos y elementos visuales apropiados',
                        'Responsive design funcional'
                    ]
                },
                {
                    name: '♿ Accesibilidad',
                    items: [
                        'Contraste de colores adecuado (WCAG AA)',
                        'Texto alternativo para elementos visuales',
                        'Estructura semántica correcta',
                        'Navegación por teclado posible',
                        'Compatible con lectores de pantalla'
                    ]
                },
                {
                    name: '📱 Compatibilidad',
                    items: [
                        'Renderizado correcto en Gmail',
                        'Renderizado correcto en Outlook',
                        'Renderizado correcto en Apple Mail',
                        'Visualización móvil optimizada',
                        'Fallbacks funcionando correctamente'
                    ]
                },
                {
                    name: '📝 Contenido',
                    items: [
                        'Texto claro y comprensible',
                        'Información relevante y contextual',
                        'CTAs prominentes y efectivos',
                        'Instrucciones paso a paso claras',
                        'Información de seguridad adecuada'
                    ]
                },
                {
                    name: '🔧 Funcionalidad',
                    items: [
                        'Enlaces funcionando correctamente',
                        'Variables de plantilla procesándose',
                        'Botones con área táctil adecuada',
                        'URLs de fallback incluidas',
                        'Modo oscuro implementado'
                    ]
                },
                {
                    name: '🛡️ Seguridad',
                    items: [
                        'Advertencias de tiempo de expiración',
                        'Información de phishing incluida',
                        'Medidas de seguridad explicadas',
                        'Enlaces seguros y validados',
                        'Información de contacto para soporte'
                    ]
                }
            ],
            approvalProcess: [
                '1. Revisar todos los archivos de preview generados',
                '2. Verificar cada elemento del checklist',
                '3. Probar en diferentes clientes de email',
                '4. Confirmar que el contenido es apropiado',
                '5. Aprobar para implementación en producción'
            ]
        };

        fs.writeFileSync(
            path.join(this.outputPath, 'approval-checklist.json'),
            JSON.stringify(checklist, null, 2)
        );

        console.log('✅ Checklist de aprobación generado: approval-checklist.json');
    }
}