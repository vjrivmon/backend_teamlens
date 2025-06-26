# 🚀 TeamLens Launcher - Guía de Uso

## 📋 Descripción

Este conjunto de scripts automatiza completamente el proceso de lanzamiento de la aplicación **TeamLens** en entornos de desarrollo local. Incluye verificación de prerequisitos, instalación de dependencias, compilación y ejecución concurrente de ambos servicios (frontend y backend).

## 🏗️ Arquitectura del Sistema

```
TeamLens Application Stack
├── Frontend (Angular)     → Puerto 4200
├── Backend (Node.js/TS)   → Puerto 3000  
└── Database (MongoDB)     → Puerto 27017
```

## 📁 Archivos Incluidos

### 1. `launch-teamlens.ps1` (Recomendado)
- **Tecnología**: PowerShell Core/Windows PowerShell
- **Características**: 
  - ✅ Gestión avanzada de procesos
  - ✅ Logging con timestamps y colores
  - ✅ Verificación de puertos
  - ✅ Manejo robusto de errores
  - ✅ Parámetros configurables
  - ✅ Cleanup automático

### 2. `launch-teamlens.bat`
- **Tecnología**: Batch tradicional (cmd.exe)
- **Características**:
  - ✅ Compatibilidad universal con Windows
  - ✅ Ejecución en ventanas separadas
  - ✅ Verificación básica de prerequisitos
  - ✅ Gestión simple de procesos

## 🔧 Prerequisitos del Sistema

### Obligatorios
- **Node.js**: Versión 18.0+ 
  ```bash
  # Verificar instalación
  node --version
  ```
- **npm**: Incluido con Node.js
  ```bash
  # Verificar instalación  
  npm --version
  ```

### Recomendados
- **MongoDB**: Local o en contenedor Docker
  ```bash
  # Verificar estado (si está instalado localmente)
  mongod --version
  ```
- **Git**: Para clonado y gestión de versiones
- **Visual Studio Code**: IDE recomendado para desarrollo

### Configuración de MongoDB

#### Opción 1: MongoDB Local
```bash
# Windows (usando Chocolatey)
choco install mongodb

# Iniciar servicio
net start MongoDB
```

#### Opción 2: MongoDB con Docker
```bash
# Ejecutar contenedor MongoDB
docker run -d -p 27017:27017 --name teamlens-mongo mongo:latest
```

## 🚀 Instrucciones de Uso

### Método 1: PowerShell (Recomendado)

#### Ejecución Básica
```powershell
# Abrir PowerShell como Administrador (recomendado)
# Navegar al directorio del proyecto
cd "C:\Users\Visi\RoadToSoftware\teamlens"

# Ejecutar script
.\launch-teamlens.ps1
```

#### Opciones Avanzadas
```powershell
# Instalación limpia (elimina node_modules)
.\launch-teamlens.ps1 -CleanInstall

# Omitir instalación de dependencias
.\launch-teamlens.ps1 -SkipInstall

# Modo verbose para troubleshooting
.\launch-teamlens.ps1 -Verbose

# Combinación de parámetros
.\launch-teamlens.ps1 -CleanInstall -Verbose
```

### Método 2: Batch

#### Ejecución Simple
```cmd
:: Abrir símbolo del sistema (cmd)
:: Navegar al directorio del proyecto
cd "C:\Users\Visi\RoadToSoftware\teamlens"

:: Ejecutar script
launch-teamlens.bat
```

## 🔍 Verificación Post-Ejecución

### 1. Verificar Servicios Activos
```bash
# Frontend Angular
curl http://localhost:4200

# Backend Node.js  
curl http://localhost:3000/api/health
```

### 2. Verificar Procesos
```powershell
# PowerShell
Get-Process | Where-Object {$_.ProcessName -like "*node*"}

# CMD
tasklist | findstr node
```

### 3. Verificar Puertos
```powershell
# PowerShell
Get-NetTCPConnection -LocalPort 4200,3000,27017
```

## 🏗️ Flujo de Ejecución Detallado

### Fase 1: Verificación de Prerequisitos
1. ✅ Verificar instalación de Node.js
2. ✅ Verificar disponibilidad de npm
3. ✅ Comprobar disponibilidad de puertos
4. ✅ Validar estructura de directorios

### Fase 2: Preparación del Entorno
1. 📦 Instalar dependencias del backend
2. 📦 Instalar dependencias del frontend  
3. 🔨 Compilar código TypeScript del backend
4. 🧹 Limpiar builds anteriores

### Fase 3: Lanzamiento de Servicios
1. 🖥️ **Backend**: Iniciar en modo desarrollo (puerto 3000)
2. ⏱️ Esperar 3 segundos para inicialización
3. 🌐 **Frontend**: Iniciar servidor de desarrollo (puerto 4200)
4. 📊 Monitorear estado de procesos

## 🛠️ Troubleshooting

### Problemas Comunes

#### Error: "Node.js no encontrado"
```powershell
# Solución 1: Reinstalar Node.js
# Descargar desde: https://nodejs.org/

# Solución 2: Verificar PATH
$env:PATH -split ';' | Select-String node
```

#### Error: "Puerto ya en uso"
```powershell
# Identificar proceso usando el puerto
Get-NetTCPConnection -LocalPort 3000 | Select-Object OwningProcess
Get-Process -Id <ProcessID>

# Terminar proceso
Stop-Process -Id <ProcessID> -Force
```

#### Error: "MongoDB connection failed"
```bash
# Verificar estado de MongoDB
# Local:
net start MongoDB

# Docker:
docker ps | grep mongo
docker start teamlens-mongo
```

#### Error: "Cannot load module"
```bash
# Reinstalación limpia
rm -rf backend_teamlens/node_modules
rm -rf frontend_teamlens/node_modules
.\launch-teamlens.ps1 -CleanInstall
```

### Logs y Debugging

#### Ubicación de Logs
- **Frontend**: Consola del navegador (F12)
- **Backend**: Terminal donde se ejecuta el script
- **MongoDB**: `C:\Program Files\MongoDB\Server\X.X\log\`

#### Modo Debug Backend
```powershell
# En backend_teamlens/
npm run dev -- --inspect
# Luego abrir chrome://inspect en Chrome
```

## ⚙️ Configuración Avanzada

### Variables de Entorno (.env-dev)
```env
# backend_teamlens/.env-dev
ENVIROMENT="development"
JWT_SECRET="jwt-secret-key"
JWT_ALGORITHM="HS256"
COOKIE_SECRET="cookie-secret-key"
MONGO_URI="mongodb://localhost:27017/"
DB_NAME="test"
EMAIL_USER="dalfamosni@mail.com"
EMAIL_PASSWORD="1234"
```

### Configuración de Puertos
```javascript
// Para cambiar puertos por defecto:
// backend_teamlens/src/index.ts
const PORT = process.env.PORT || 3000;

// frontend_teamlens/angular.json
"serve": {
  "builder": "@angular-devkit/build-angular:dev-server",
  "options": {
    "port": 4200
  }
}
```

## 🚀 Producción vs Desarrollo

### Desarrollo (Actual)
- **Backend**: `npm run dev` (ts-node-dev con hot reload)
- **Frontend**: `ng serve` (webpack dev server)
- **Database**: MongoDB local/Docker

### Producción (Referencia)
- **Backend**: `npm start` (código compilado)
- **Frontend**: `ng build --prod` + Nginx
- **Database**: MongoDB Atlas/dedicado
- **Process Manager**: PM2

## 📞 Soporte

### Contacto del Equipo DevOps
- **Email**: devops@teamlens.com
- **Slack**: #teamlens-support
- **Wiki**: [Confluence TeamLens](internal-link)

### Issues y Feature Requests
- **Repository**: [GitHub TeamLens](https://github.com/organization/teamlens)
- **Issue Tracker**: Usar templates proporcionados
- **Pull Requests**: Seguir coding standards del equipo

---

**Nota**: Este launcher está optimizado para entornos de desarrollo. Para despliegues en producción, consulte la documentación de despliegue específica en `/TeamlensDespliegue/`.

*Última actualización: $(Get-Date -Format "yyyy-MM-dd")* 