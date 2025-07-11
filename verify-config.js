#!/usr/bin/env node
/**
 * Script de verificación de configuración para TeamLens Backend
 * Ejecutar en el servidor para verificar qué variables de entorno se están cargando
 * 
 * Uso:
 *   node verify-config.js
 *   node --env-file .env.production verify-config.js
 */

console.log('🔍 [TEAMLENS] Verificador de Configuración v1.0');
console.log('=' .repeat(60));

// Verificar NODE_ENV
console.log(`📊 NODE_ENV: ${process.env.NODE_ENV || 'undefined'}`);
console.log(`📊 ENVIROMENT: ${process.env.ENVIROMENT || 'undefined'}`);

console.log('\n🌐 CONFIGURACIÓN DE URLs:');
console.log('-'.repeat(40));
console.log(`FRONTEND_URL: ${process.env.FRONTEND_URL || 'undefined'}`);
console.log(`BASE_URL: ${process.env.BASE_URL || 'undefined'}`);
console.log(`WEBSOCKET_ORIGINS: ${process.env.WEBSOCKET_ORIGINS || 'undefined'}`);

console.log('\n📧 CONFIGURACIÓN DE EMAIL:');
console.log('-'.repeat(40));
console.log(`EMAIL_USER: ${process.env.EMAIL_USER || 'undefined'}`);
console.log(`EMAIL_HOST: ${process.env.EMAIL_HOST || 'undefined'}`);
console.log(`EMAIL_PORT: ${process.env.EMAIL_PORT || 'undefined'}`);

console.log('\n🔐 CONFIGURACIÓN DE SEGURIDAD:');
console.log('-'.repeat(40));
console.log(`JWT_SECRET: ${process.env.JWT_SECRET ? '[CONFIGURADO]' : 'undefined'}`);
console.log(`COOKIE_SECRET: ${process.env.COOKIE_SECRET ? '[CONFIGURADO]' : 'undefined'}`);

console.log('\n📚 CONFIGURACIÓN DE BASE DE DATOS:');
console.log('-'.repeat(40));
console.log(`MONGO_URI: ${process.env.MONGO_URI || 'undefined'}`);
console.log(`DB_NAME: ${process.env.DB_NAME || 'undefined'}`);

console.log('\n🎯 ANÁLISIS:');
console.log('-'.repeat(40));

// Análisis de problemas comunes
const isProduction = process.env.NODE_ENV === 'production';
const frontendUrl = process.env.FRONTEND_URL;

if (isProduction && (!frontendUrl || frontendUrl.includes('localhost'))) {
    console.error('🚨 ERROR CRÍTICO: En producción pero FRONTEND_URL usa localhost');
    console.error('   Solución: Verificar que se esté usando .env.production');
} else if (isProduction && frontendUrl) {
    console.log('✅ FRONTEND_URL configurada correctamente para producción');
} else if (!isProduction) {
    console.log('ℹ️  Modo desarrollo detectado');
}

if (!process.env.JWT_SECRET || !process.env.COOKIE_SECRET) {
    console.error('🚨 ERROR: Secretos de seguridad no configurados');
}

if (!process.env.MONGO_URI) {
    console.error('🚨 ERROR: Base de datos no configurada');
}

console.log('\n📋 COMANDOS ÚTILES PARA DEBUGGING:');
console.log('-'.repeat(40));
console.log('  pm2 logs teamlens-backend --lines 50');
console.log('  pm2 env teamlens-backend');
console.log('  curl http://localhost:3000/health');
console.log('  node --env-file .env.production verify-config.js');

console.log('\n' + '='.repeat(60)); 