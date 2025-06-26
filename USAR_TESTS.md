# 🚀 Guía Rápida - Ejecución de Tests en TeamLens

## ⚡ Inicio Rápido

### Ejecutar Tests con Script PowerShell (Recomendado)

```powershell
# Desde PowerShell en el directorio backend_teamlens
.\run-tests.ps1
```

**¡Eso es todo!** El script te guiará a través de un menú interactivo.

### Menú Principal
```
1. 🧪 Ejecutar TODOS los tests
2. 🔧 Tests unitarios únicamente  
3. 🔗 Tests de integración únicamente
4. 📊 Tests con reporte de cobertura
5. 👀 Tests en modo watch (desarrollo)
6. 🧹 Limpiar archivos temporales
7. 📋 Verificar configuración del entorno
8. ❌ Salir
```

## 🔧 Comandos NPM Directos

Si prefieres usar comandos NPM directamente:

```bash
# Todos los tests
npm test

# Solo tests unitarios
npm run test:unit

# Tests con cobertura
npm run test:coverage

# Modo watch para desarrollo
npm run test:watch
```

## 📊 Ver Reportes de Cobertura

Después de ejecutar tests con cobertura:
```
coverage/lcov-report/index.html
```

## 🧪 Verificación Rápida

Antes de usar el script completo, verifica que Jest funciona:
```powershell
# Test rápido
.\test-quick.ps1

# O directamente:
npx jest simple.test.ts
```

## ⚠️ Resolución de Problemas

### Error: "No se pueden ejecutar scripts"
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### Error: "Jest no encontrado"
```bash
npm install
```

### Error: "MongoDB Memory Server"
Los tests usan MongoDB en memoria - no necesitas MongoDB instalado.

### ✅ **PROBLEMA RESUELTO: Jest ahora funciona correctamente**
- Jest v29.7.0 instalado y funcionando
- MongoDB Memory Server configurado
- Tests básicos verificados y funcionando

## 🎯 Tests Incluidos

- ✅ **Autenticación** - Login, registro, JWT
- ✅ **Usuarios** - Invitaciones, notificaciones
- ✅ **Grupos** - Creación, gestión, validaciones
- ✅ **Servicios** - Base de datos, email
- ✅ **Middlewares** - Seguridad, verificación

## 🚀 Para Desarrollo Continuo

**Usa modo watch** para que los tests se ejecuten automáticamente:
```powershell
# Opción 5 en el menú del script
.\run-tests.ps1
```

---

*Los tests son tu red de seguridad - úsalos frecuentemente* 🛡️ 