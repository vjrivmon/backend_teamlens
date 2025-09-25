#!/usr/bin/env node

/**
 * 🧪 Test de Configuración UPV Email - TeamLens
 *
 * Este script verifica la configuración de email UPV SIN ENVIAR EMAILS REALES
 * Útil para testing seguro antes de desplegar en producción
 *
 * Uso: node test-upv-email-config.js
 */

// Usar variables de entorno del sistema (no requiere dotenv)
// Para probar con .env-dev, ejecuta: export $(cat .env-dev | xargs) && node test-upv-email-config.js

console.log('🧪 =================================================');
console.log('🧪 TEST DE CONFIGURACIÓN UPV EMAIL - TeamLens');
console.log('🧪 =================================================\n');

console.log('📋 1. VERIFICANDO VARIABLES DE ENTORNO...\n');

// Verificar variables Gmail (actuales)
console.log('📧 Gmail (Actual):');
console.log(`  EMAIL_USER: ${process.env.EMAIL_USER ? '✅ Configurado' : '❌ No configurado'}`);
console.log(`  EMAIL_PASSWORD: ${process.env.EMAIL_PASSWORD ? '✅ Configurado' : '❌ No configurado'}`);
console.log(`  EMAIL_FROM: ${process.env.EMAIL_FROM || process.env.EMAIL_USER || '❌ No configurado'}`);

// Verificar variables Outlook/Office365
console.log('\n🏢 Office365/Outlook (UPV):');
console.log(`  OUTLOOK_EMAIL: ${process.env.OUTLOOK_EMAIL ? '✅ ' + process.env.OUTLOOK_EMAIL : '❌ No configurado'}`);
console.log(`  OUTLOOK_PASSWORD: ${process.env.OUTLOOK_PASSWORD ? '✅ Configurado' : '❌ No configurado'}`);
console.log(`  OUTLOOK_FROM: ${process.env.OUTLOOK_FROM || process.env.OUTLOOK_EMAIL || '❌ No configurado'}`);

// Verificar variables SMTP UPV
console.log('\n🏛️ SMTP UPV Directo:');
console.log(`  UPV_SMTP_HOST: ${process.env.UPV_SMTP_HOST || '❌ No configurado'}`);
console.log(`  UPV_SMTP_USER: ${process.env.UPV_SMTP_USER ? '✅ ' + process.env.UPV_SMTP_USER : '❌ No configurado'}`);
console.log(`  UPV_SMTP_PASSWORD: ${process.env.UPV_SMTP_PASSWORD ? '✅ Configurado' : '❌ No configurado'}`);
console.log(`  UPV_SMTP_FROM: ${process.env.UPV_SMTP_FROM || process.env.UPV_SMTP_USER || '❌ No configurado'}`);

// Simular inicialización de proveedores (como en email.service.ts)
console.log('\n📡 2. SIMULANDO INICIALIZACIÓN DE PROVEEDORES...\n');

const providers = [];

// Gmail
if (process.env.EMAIL_USER && process.env.EMAIL_PASSWORD) {
    providers.push({
        name: 'Gmail Principal',
        host: 'smtp.gmail.com',
        user: process.env.EMAIL_USER,
        dailyLimit: 500
    });
    console.log('✅ Proveedor Gmail Principal iniciado');
} else {
    console.log('⚠️ Proveedor Gmail Principal NO iniciado (faltan variables)');
}

// Outlook/Office365
if (process.env.OUTLOOK_EMAIL && process.env.OUTLOOK_PASSWORD) {
    providers.push({
        name: 'Outlook/Office365',
        host: 'smtp.office365.com',
        user: process.env.OUTLOOK_EMAIL,
        dailyLimit: 10000
    });
    console.log('✅ Proveedor Outlook/Office365 iniciado');
} else {
    console.log('⚠️ Proveedor Outlook/Office365 NO iniciado (faltan variables)');
}

// SMTP UPV
if (process.env.UPV_SMTP_HOST && process.env.UPV_SMTP_USER && process.env.UPV_SMTP_PASSWORD) {
    providers.push({
        name: 'SMTP UPV',
        host: process.env.UPV_SMTP_HOST,
        user: process.env.UPV_SMTP_USER,
        dailyLimit: parseInt(process.env.UPV_SMTP_DAILY_LIMIT || '5000')
    });
    console.log('✅ Proveedor SMTP UPV iniciado');
} else {
    console.log('⚠️ Proveedor SMTP UPV NO iniciado (faltan variables)');
}

console.log(`\n📊 Total de proveedores configurados: ${providers.length}`);

// Simular lógica de selección de proveedor (como en selectProviderForEmail)
console.log('\n🎯 3. SIMULANDO SELECCIÓN DE PROVEEDOR PARA DOMINIOS UPV...\n');

const upvEmails = [
    'estudiante@alumno.upv.es',
    'profesor@epsg.upv.es',
    'admin@upv.es'
];

function selectProviderForEmail(email) {
    const domain = email.split('@')[1]?.toLowerCase();

    // Para correos UPV, preferir proveedores corporativos
    if (domain === 'epsg.upv.es' || domain === 'alumno.upv.es' || domain === 'upv.es') {
        // Buscar primero SMTP UPV
        const upvProvider = providers.find(p => p.name === 'SMTP UPV');
        if (upvProvider) {
            return upvProvider;
        }

        // Luego intentar con Outlook/Office365
        const outlookProvider = providers.find(p => p.name === 'Outlook/Office365');
        if (outlookProvider) {
            return outlookProvider;
        }
    }

    // Para otros dominios, usar cualquier proveedor disponible
    return providers[0] || null;
}

upvEmails.forEach(email => {
    const selectedProvider = selectProviderForEmail(email);
    const domain = email.split('@')[1];

    if (selectedProvider) {
        console.log(`📧 ${email} → ✅ ${selectedProvider.name} (${selectedProvider.host})`);
    } else {
        console.log(`📧 ${email} → ❌ Sin proveedor disponible`);
    }
});

// Verificar configuración frontend
console.log('\n🌐 4. VERIFICANDO CONFIGURACIÓN FRONTEND...\n');

const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:4200';
console.log(`Frontend URL: ${frontendUrl}`);

if (frontendUrl.includes('localhost') && process.env.NODE_ENV === 'production') {
    console.log('🚨 ¡ADVERTENCIA! Frontend URL contiene localhost en PRODUCCIÓN');
} else {
    console.log('✅ Frontend URL configurada correctamente');
}

// Resumen final
console.log('\n📋 5. RESUMEN FINAL...\n');

const upvProviders = providers.filter(p =>
    p.name === 'SMTP UPV' || p.name === 'Outlook/Office365'
);

if (upvProviders.length > 0) {
    console.log('🎉 ¡CONFIGURACIÓN UPV LISTA!');
    console.log(`✅ ${upvProviders.length} proveedor(es) UPV configurado(s)`);
    console.log('✅ Emails a dominios UPV usarán proveedores corporativos automáticamente');
    console.log('✅ Sistema mantendrá Gmail como fallback para otros dominios');

    console.log('\n📝 Proveedores UPV activos:');
    upvProviders.forEach(provider => {
        console.log(`  • ${provider.name} (${provider.dailyLimit} emails/día)`);
    });

} else {
    console.log('⚠️ CONFIGURACIÓN UPV PENDIENTE');
    console.log('❌ No hay proveedores UPV configurados');
    console.log('📧 Sistema seguirá usando Gmail para todos los dominios');
    console.log('\n📋 Para habilitar UPV, configura:');
    console.log('   • OUTLOOK_EMAIL + OUTLOOK_PASSWORD (recomendado)');
    console.log('   • O: UPV_SMTP_HOST + UPV_SMTP_USER + UPV_SMTP_PASSWORD');
}

console.log('\n🛡️ 6. PRÓXIMOS PASOS...\n');

if (upvProviders.length > 0) {
    console.log('✅ Tu configuración está lista para producción');
    console.log('1. Copia las mismas variables a .env.production');
    console.log('2. Reinicia el servidor: sudo systemctl restart teamlens-backend');
    console.log('3. Monitorea logs para verificar selección de proveedores');
} else {
    console.log('📋 Pendiente: Obtener credenciales UPV');
    console.log('1. Contacta IT UPV para obtener:');
    console.log('   • Email institucional para TeamLens');
    console.log('   • Password de aplicación');
    console.log('2. Configura variables en .env-dev');
    console.log('3. Re-ejecuta este test');
    console.log('4. Copia configuración a .env.production');
}

console.log('\n🧪 =================================================');
console.log('🧪 TEST COMPLETADO - NO SE ENVIARON EMAILS REALES');
console.log('🧪 =================================================\n');