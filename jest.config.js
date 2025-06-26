/**
 * Configuración Jest para TeamLens Backend
 * Configuración enterprise-grade para testing de aplicaciones Node.js + TypeScript
 * 
 * @author DevOps Senior - TeamLens
 * @version 1.0.0
 */

module.exports = {
  // Preset para TypeScript
  preset: 'ts-jest',
  
  // Entorno de testing
  testEnvironment: 'node',
  
  // Directorios de pruebas
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  
  // Patrones de archivos de test
  testMatch: [
    '**/tests/**/*.test.ts',
    '**/tests/**/*.spec.ts',
    '**/__tests__/**/*.ts'
  ],
  
  // Transformaciones de archivos
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  
  // Configuración de coverage profesional
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/index.ts',
    '!src/scripts/**/*',
    '!src/**/*.interface.ts'
  ],
  
  // Umbrales de coverage para mantener calidad enterprise
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
  
  // Reportes de coverage
  coverageReporters: [
    'text',
    'lcov', 
    'html',
    'json-summary'
  ],
  
  // Directorio de reportes
  coverageDirectory: 'coverage',
  
  // Setup y teardown
  setupFilesAfterEnv: ['<rootDir>/tests/setup/jest.setup.ts'],
  
  // Configuración de módulos
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@models/(.*)$': '<rootDir>/src/models/$1',
    '^@services/(.*)$': '<rootDir>/src/services/$1',
    '^@functions/(.*)$': '<rootDir>/src/functions/$1',
    '^@middlewares/(.*)$': '<rootDir>/src/middlewares/$1'
  },
  
  // Timeouts para tests que involucran DB/API
  testTimeout: 30000,
  
  // Variables de entorno para testing
  setupFiles: ['<rootDir>/tests/setup/env.setup.ts'],
  
  // Limpieza de mocks entre tests
  clearMocks: true,
  restoreMocks: true,
  
  // Configuración verbose para debugging
  verbose: true,
  
  // Detectar archivos abiertos (útil para debugging)
  detectOpenHandles: true,
  
  // Force exit después de todos los tests
  forceExit: true
}; 