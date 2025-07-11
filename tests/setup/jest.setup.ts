/**
 * Setup Global de Jest para TeamLens
 * Configuraciones, mocks y helpers globales para testing enterprise
 * 
 * @author DevOps Senior - TeamLens Testing Suite
 * @version 1.0.0
 */

import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';

// Variables globales para testing
declare global {
  var __MONGO_INSTANCE__: MongoMemoryServer;
  var __MONGO_URI__: string;
  var testDbConnection: MongoClient;
}

/**
 * Setup global antes de todos los tests
 */
beforeAll(async () => {
  console.log('🚀 [Jest Setup] Iniciando configuración global de tests...');
  
  // Configurar MongoDB Memory Server para tests aislados
  global.__MONGO_INSTANCE__ = await MongoMemoryServer.create({
    instance: {
      dbName: 'teamlens_test'
    }
  });
  
  global.__MONGO_URI__ = global.__MONGO_INSTANCE__.getUri();
  process.env.MONGO_URI = global.__MONGO_URI__;
  
  console.log(`✅ [Jest Setup] MongoDB Memory Server iniciado: ${global.__MONGO_URI__}`);
  
  // Configurar timeout global para tests
  jest.setTimeout(30000);
  
  // Configurar mocks globales para console.log/error en tests (opcional)
  const originalError = console.error;
  
  // Silenciar logs durante tests (mantener solo errores críticos)
  console.log = jest.fn();
  console.error = jest.fn((message: any) => {
    if (typeof message === 'string' && message.includes('❌')) {
      originalError(message); // Mostrar solo errores críticos
    }
  });
  
  console.log('✅ [Jest Setup] Configuración global completada');
});

/**
 * Cleanup después de todos los tests
 */
afterAll(async () => {
  console.log('🧹 [Jest Setup] Iniciando cleanup global...');
  
  // Cerrar conexión de test si existe
  if (global.testDbConnection) {
    await global.testDbConnection.close();
  }
  
  // Detener MongoDB Memory Server
  if (global.__MONGO_INSTANCE__) {
    await global.__MONGO_INSTANCE__.stop();
    console.log('✅ [Jest Setup] MongoDB Memory Server detenido');
  }
  
  console.log('✅ [Jest Setup] Cleanup global completado');
});

/**
 * Setup antes de cada test individual
 */
beforeEach(() => {
  // Limpiar todos los mocks antes de cada test
  jest.clearAllMocks();
  
  // Reset de variables de entorno si fueron modificadas
  process.env.NODE_ENV = 'test';
});

/**
 * Cleanup después de cada test individual
 */
afterEach(() => {
  // Restaurar mocks después de cada test
  jest.restoreAllMocks();
});

// Los helpers de testing se definen localmente en cada archivo de test
// para evitar dependencias circulares y mejorar la claridad

console.log('🧪 [Jest Setup] Archivo de setup cargado - Configuración global completada'); 