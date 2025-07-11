# 🧪 TeamLens - Suite de Tests Unitarios Enterprise

## 📋 Descripción General

Esta es una suite completa de tests unitarios diseñada para **TeamLens**, una plataforma de gestión de equipos educativos. Los tests están construidos con un enfoque **enterprise-grade** que garantiza la estabilidad y confiabilidad del sistema durante el desarrollo continuo.

### 🎯 Objetivos de la Suite de Testing

- ✅ **Prevenir regresiones** durante el desarrollo
- ✅ **Identificar errores tempranamente** en el ciclo de desarrollo
- ✅ **Documentar comportamientos esperados** del sistema
- ✅ **Facilitar refactoring seguro** del código
- ✅ **Asegurar calidad enterprise** en producción

---

## 🚀 Instalación y Configuración

### 📦 Instalación de Dependencias

```bash
# Instalar todas las dependencias de testing
npm install

# Solo dependencias de desarrollo
npm install --only=dev
```

### ⚙️ Configuración del Entorno

Los tests utilizan **MongoDB Memory Server** para crear una base de datos en memoria completamente aislada. No requiere configuración adicional.

---

## 🏃‍♂️ Ejecución de Tests

### 🔧 Comandos Disponibles

```bash
# Ejecutar todos los tests
npm test

# Ejecutar tests en modo watch (re-ejecución automática)
npm run test:watch

# Ejecutar tests con reporte de cobertura
npm run test:coverage

# Ejecutar solo tests unitarios
npm run test:unit

# Ejecutar solo tests de integración
npm run test:integration
```

### 📊 Visualizar Cobertura

```bash
# Generar reporte de cobertura
npm run test:coverage

# Abrir reporte HTML (después de ejecutar coverage)
open coverage/lcov-report/index.html
```

---

## 🔍 Funcionalidades Testeadas

### 🔐 **Autenticación y Seguridad** (CRÍTICO)
- **Login/Logout** con validaciones completas
- **Registro de profesores y estudiantes**
- **Tokens JWT** - validación, expiración, seguridad
- **Reset de contraseñas** con tokens temporales
- **Middleware de verificación** de autenticación

**Archivos**: `auth.test.ts`, `middlewares.test.ts`

### 👤 **Gestión de Usuarios** (ALTO)
- **Creación de cuentas temporales** para invitaciones
- **Sistema de invitaciones por email** automatizado
- **Gestión de notificaciones** de usuarios
- **Validaciones de datos** y sanitización

**Archivos**: `user-functions.test.ts`

### 👥 **Gestión de Grupos** (ALTO)
- **Creación de grupos** con validaciones de negocio
- **Asignación de estudiantes** con prevención de duplicados
- **Eliminación de grupos** con limpieza referencial
- **Validaciones de integridad** entre usuarios y actividades

**Archivos**: `group-functions.test.ts`

### 🔧 **Servicios del Sistema** (MEDIO-ALTO)
- **Base de datos MongoDB** - conexiones, operaciones CRUD
- **Servicio de email** - envío, templates, validaciones
- **Configuraciones de entorno** y variables

**Archivos**: `services.test.ts`

---

## 📈 Métricas de Calidad

### 🎯 Umbrales de Cobertura Requeridos

```javascript
coverageThreshold: {
  global: {
    branches: 80%,    // Cobertura de ramas
    functions: 80%,   // Cobertura de funciones
    lines: 80%,       // Cobertura de líneas
    statements: 80%   // Cobertura de declaraciones
  }
}
```

### 📊 Métricas Objetivo
- **Cobertura Total**: > 80%
- **Tests Pasando**: 100%
- **Tiempo de Ejecución**: < 30 segundos
- **Detección de Memory Leaks**: Automática

---

## 🔬 Tipos de Tests Implementados

### ✅ **Tests Unitarios Puros**
- Funciones aisladas sin dependencias externas
- Validaciones de lógica de negocio
- Manejo de casos edge

### 🔗 **Tests de Integración**
- Interacción entre módulos
- Operaciones de base de datos
- Flujos completos de autenticación

### 🛡️ **Tests de Seguridad**
- Validación de tokens JWT
- Prevención de inyección
- Manejo de datos sensibles

### ⚡ **Tests de Performance**
- Operaciones concurrentes
- Manejo de grandes volúmenes de datos
- Timeouts y memory usage

---

## 🚨 Identificación y Resolución de Errores

### 🔍 **Interpretando Resultados de Tests**

#### ✅ **Test Exitoso**
```
✅ [Auth Tests] Login exitoso verificado
PASS tests/unit/auth.test.ts
```

#### ❌ **Test Fallido**
```
❌ [Auth Tests] Login fallido
FAIL tests/unit/auth.test.ts
Expected: 200
Received: 401
```

#### ⚠️ **Test con Warning**
```
⚠️ [Performance Warning] Operación tardó más de lo esperado: 2.5s
```

### 🔧 **Tipos de Errores Comunes**

#### 1. **Errores de Autenticación**
```bash
# Error típico
Error: Invalid credentials.

# Solución
- Verificar configuración de JWT_SECRET
- Revisar formato de tokens
- Validar expiración de tokens
```

#### 2. **Errores de Base de Datos**
```bash
# Error típico
Error: MongoError: Collection not found

# Solución
- Verificar conexión a MongoDB Memory Server
- Revisar configuración de colecciones
- Limpiar datos de tests previos
```

#### 3. **Errores de Email Service**
```bash
# Error típico
Error: SMTP Connection failed

# Solución
- Verificar configuración de email de test
- Revisar mocks del servicio de email
- Validar variables de entorno
```

#### 4. **Errores de Performance**
```bash
# Error típico
Timeout: Test exceeded 30000ms

# Solución
- Optimizar consultas de base de datos
- Reducir datos de test
- Revisar operaciones sincronas/asincronas
```

### 🔄 **Pasos para Debugging**

1. **Ejecutar test específico**:
   ```bash
   npm test -- --testNamePattern="nombre del test"
   ```

2. **Habilitar modo verbose**:
   ```bash
   npm test -- --verbose
   ```

3. **Revisar logs detallados**:
   ```bash
   npm test -- --silent=false
   ```

4. **Ejecutar con debugger**:
   ```bash
   node --inspect-brk node_modules/.bin/jest --runInBand
   ```

---

## 🏗️ Arquitectura de Tests

### 📁 **Estructura de Directorios**

```
tests/
├── setup/                      # Configuración global
│   ├── env.setup.ts            # Variables de entorno
│   └── jest.setup.ts           # Setup de Jest
├── unit/                       # Tests unitarios
│   ├── auth.test.ts            # Tests de autenticación
│   ├── user-functions.test.ts  # Tests de usuarios
│   ├── group-functions.test.ts # Tests de grupos
│   ├── middlewares.test.ts     # Tests de middlewares
│   └── services.test.ts        # Tests de servicios
└── README.md                   # Esta documentación
```

### 🔧 **Configuraciones Importantes**

- **jest.config.js**: Configuración principal de Jest
- **MongoDB Memory Server**: Base de datos en memoria
- **Mocks automáticos**: Para servicios externos
- **Coverage reporting**: Reportes detallados

---

## 🚀 **Mejores Prácticas Implementadas**

### ✅ **Naming Conventions**
- Tests descriptivos en español para claridad
- Emojis para identificación visual rápida
- Prefijos ✅/❌ para indicar resultado esperado

### ✅ **Isolation**
- Cada test es completamente independiente
- Setup/teardown automático entre tests
- Base de datos limpia para cada test

### ✅ **Performance**
- Timeouts configurables
- Ejecución paralela cuando es posible
- Cleanup automático de recursos

### ✅ **Maintainability**
- Helpers reutilizables
- Mocks centralizados
- Documentación inline

---

## 📞 **Soporte y Troubleshooting**

### 🐛 **Reportar Issues**

Si encuentras errores consistentes:

1. **Documenta el error**:
   - Comando ejecutado
   - Mensaje de error completo
   - Variables de entorno relevantes

2. **Reproduce el error**:
   - Aísla el test problemático
   - Ejecuta solo ese test
   - Verifica dependencias

3. **Consulta logs**:
   - Revisa `coverage/` para reportes detallados
   - Verifica configuración en `jest.config.js`

### 📚 **Recursos Adicionales**

- **Jest Documentation**: https://jestjs.io/docs/
- **MongoDB Memory Server**: https://github.com/nodkz/mongodb-memory-server
- **Supertest**: https://github.com/visionmedia/supertest

---

## 🔄 **Mantenimiento de Tests**

### 📅 **Tareas Regulares**

- **Semanal**: Revisar cobertura de código
- **Con cada feature**: Añadir tests correspondientes
- **Mensual**: Optimizar performance de tests
- **Release**: Ejecutar suite completa

### 🔧 **Actualización de Tests**

Cuando modifiques el código fuente:

1. **Ejecuta tests relacionados** primero
2. **Actualiza tests** si cambia la API
3. **Añade nuevos tests** para nuevas funcionalidades
4. **Verifica cobertura** no disminuya

---

## 🎯 **Conclusión**

Esta suite de tests está diseñada para ser tu **red de seguridad** durante el desarrollo. Úsala frecuentemente, confía en sus resultados, y mantén la cobertura alta para garantizar la calidad enterprise de TeamLens.

**¡Tests que fallan son bugs que no llegaron a producción!** 🚀

---

*Desarrollado por el equipo DevOps Senior - TeamLens Testing Suite v1.0.0* 