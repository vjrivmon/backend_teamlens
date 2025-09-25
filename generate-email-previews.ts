#!/usr/bin/env npx ts-node

/**
 * Script para generar previews de los templates de email mejorados
 * Permite visualizar y aprobar los cambios antes de implementarlos
 */

import { EmailPreviewGenerator } from './src/utils/email-preview-generator';

async function main() {
    console.log('🎨 ===== GENERADOR DE PREVIEWS - TEMPLATES MEJORADOS =====');
    console.log('🚨 PROYECTO EN PRODUCCIÓN - Verificación requerida antes de implementar');
    console.log('');

    try {
        const generator = new EmailPreviewGenerator();

        // Generar todos los previews
        console.log('📧 Generando previews de templates...');
        await generator.generateAllPreviews();
        console.log('');

        // Generar reporte de mejoras
        console.log('📊 Generando reporte de mejoras...');
        await generator.generateComparisonReport();
        console.log('');

        // Generar checklist de aprobación
        console.log('✅ Generando checklist de aprobación...');
        await generator.generateApprovalChecklist();
        console.log('');

        console.log('🎉 ===== GENERACIÓN COMPLETADA =====');
        console.log('');
        console.log('📁 Archivos generados en: ./email-previews/');
        console.log('');
        console.log('📋 Archivos disponibles para revisión:');
        console.log('   • student-invitation-preview.html');
        console.log('   • questionnaire-reminder-preview.html');
        console.log('   • password-reset-preview.html');
        console.log('   • password-reset-confirmation-preview.html');
        console.log('   • improvement-report.json');
        console.log('   • approval-checklist.json');
        console.log('');
        console.log('🔍 PRÓXIMOS PASOS:');
        console.log('   1. Abra los archivos HTML en su navegador');
        console.log('   2. Revise el improvement-report.json');
        console.log('   3. Complete el approval-checklist.json');
        console.log('   4. Apruebe los cambios para implementación');
        console.log('');
        console.log('⚠️  RECORDATORIO: Este es un proyecto en producción');
        console.log('   Solo implemente después de verificación completa');

    } catch (error) {
        console.error('❌ Error durante la generación:', error);
        process.exit(1);
    }
}

// Ejecutar si es llamado directamente
if (require.main === module) {
    main().catch((error) => {
        console.error('❌ Error fatal:', error);
        process.exit(1);
    });
}

export { main };