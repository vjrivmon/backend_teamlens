/**
 * Configuración de Variables de Entorno para Testing
 * Establece un entorno controlado y seguro para la ejecución de tests
 * 
 * @author DevOps Senior - TeamLens Testing Suite
 * @version 1.0.0
 */

// Configuración de variables de entorno para testing
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_jwt_secret_key_for_teamlens_testing';
process.env.JWT_ALGORITHM = 'HS256';

// Configuración de base de datos para testing (MongoDB Memory Server)
process.env.MONGO_URI = 'mongodb://localhost:27017/teamlens_test';
process.env.DB_NAME = 'teamlens_test';

// Configuración de email para testing (modo simulado)
process.env.EMAIL_USER = 'test@teamlens.com';
process.env.EMAIL_PASSWORD = 'test_password';
process.env.FRONTEND_URL = 'http://localhost:4200';

// Configuración de timeouts para testing
process.env.TEST_TIMEOUT = '30000';

// Configuración de logging para tests
process.env.LOG_LEVEL = 'error'; // Minimizar logs durante testing

console.log('🧪 [Test Environment] Variables de entorno configuradas para testing');
console.log(`🧪 [Test Environment] JWT Secret: ${process.env.JWT_SECRET?.substring(0, 10)}...`);
console.log(`🧪 [Test Environment] Database: ${process.env.DB_NAME}`);
console.log(`🧪 [Test Environment] Email User: ${process.env.EMAIL_USER}`); 