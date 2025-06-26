@echo off
:: ================================================================
:: TeamLens Launch Script (Batch Version)
:: Sistema de Gestión de Equipos - Lanzador para Windows
:: ================================================================
:: 
:: DESCRIPCIÓN:
:: Script de lanzamiento alternativo para usuarios que prefieren
:: usar el símbolo del sistema tradicional de Windows (cmd.exe)
:: 
:: AUTOR: DevOps Team - TeamLens Project
:: VERSION: 1.0.0
:: 
:: REQUISITOS:
:: - Node.js versión 18+ instalado
:: - MongoDB ejecutándose en localhost:27017
:: - Puertos 4200 y 3000 disponibles
:: ================================================================

setlocal enabledelayedexpansion

:: Configuración de variables
set "BACKEND_PATH=backend_teamlens"
set "FRONTEND_PATH=frontend_teamlens"
set "BACKEND_PORT=3000"
set "FRONTEND_PORT=4200"

:: Verificar si estamos en el directorio correcto
if not exist "%BACKEND_PATH%" (
    echo [ERROR] No se encontró el directorio %BACKEND_PATH%
    echo        Asegúrese de ejecutar este script desde el directorio raíz del proyecto
    pause
    exit /b 1
)

if not exist "%FRONTEND_PATH%" (
    echo [ERROR] No se encontró el directorio %FRONTEND_PATH%
    echo        Asegúrese de ejecutar este script desde el directorio raíz del proyecto
    pause
    exit /b 1
)

echo.
echo ╔══════════════════════════════════════════════════════════════╗
echo ║                     TEAMLENS LAUNCHER                        ║
echo ║                  Sistema de Gestión de Equipos               ║
echo ║                                                              ║
echo ║  🚀 Lanzador Batch para Entorno de Desarrollo               ║
echo ╚══════════════════════════════════════════════════════════════╝
echo.

:: Verificar Node.js
echo [INFO] Verificando Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js no está instalado o no está en el PATH
    echo         Instale Node.js desde https://nodejs.org/
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
echo [SUCCESS] Node.js detectado: %NODE_VERSION%

:: Verificar npm
echo [INFO] Verificando npm...
npm --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] npm no está disponible
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('npm --version') do set NPM_VERSION=%%i
echo [SUCCESS] npm detectado: v%NPM_VERSION%

:: Instalar dependencias del backend
echo.
echo [INFO] Instalando dependencias del backend...
cd "%BACKEND_PATH%"
if not exist "node_modules" (
    echo [INFO] Ejecutando npm install en backend...
    call npm install
    if errorlevel 1 (
        echo [ERROR] Error instalando dependencias del backend
        cd ..
        pause
        exit /b 1
    )
    echo [SUCCESS] Dependencias del backend instaladas
) else (
    echo [SUCCESS] Dependencias del backend ya están instaladas
)

:: Compilar backend
echo [INFO] Compilando backend TypeScript...
if exist "build" rmdir /s /q "build"
call npm run tsc
if errorlevel 1 (
    echo [ERROR] Error compilando el backend
    cd ..
    pause
    exit /b 1
)
echo [SUCCESS] Backend compilado exitosamente

cd ..

:: Instalar dependencias del frontend
echo.
echo [INFO] Instalando dependencias del frontend...
cd "%FRONTEND_PATH%"
if not exist "node_modules" (
    echo [INFO] Ejecutando npm install en frontend...
    call npm install
    if errorlevel 1 (
        echo [ERROR] Error instalando dependencias del frontend
        cd ..
        pause
        exit /b 1
    )
    echo [SUCCESS] Dependencias del frontend instaladas
) else (
    echo [SUCCESS] Dependencias del frontend ya están instaladas
)

cd ..

:: Crear archivos de proceso para gestión
echo [INFO] Creando archivos de gestión de procesos...

:: Script para backend
echo @echo off > start_backend.bat
echo cd "%BACKEND_PATH%" >> start_backend.bat
echo echo [BACKEND] Iniciando servidor en puerto %BACKEND_PORT%... >> start_backend.bat
echo call npm run dev >> start_backend.bat

:: Script para frontend  
echo @echo off > start_frontend.bat
echo cd "%FRONTEND_PATH%" >> start_frontend.bat
echo echo [FRONTEND] Iniciando servidor en puerto %FRONTEND_PORT%... >> start_frontend.bat
echo call npm start >> start_frontend.bat

:: Iniciar servicios
echo.
echo [INFO] 🚀 Iniciando servicios de TeamLens...
echo [INFO] 🖥️  Iniciando backend en puerto %BACKEND_PORT%...
start "TeamLens Backend" start_backend.bat

:: Esperar un momento para que el backend se inicie
timeout /t 3 /nobreak >nul

echo [INFO] 🌐 Iniciando frontend en puerto %FRONTEND_PORT%...
start "TeamLens Frontend" start_frontend.bat

echo.
echo [SUCCESS] ✅ Servicios iniciados correctamente
echo.
echo 🔗 Frontend: http://localhost:%FRONTEND_PORT%
echo 🔗 Backend:  http://localhost:%BACKEND_PORT%
echo.
echo 📋 Para detener los servicios:
echo    1. Cierre las ventanas del terminal que se abrieron
echo    2. O presione Ctrl+C en cada una de ellas
echo.
echo 📊 Los servicios están ejecutándose en ventanas separadas
echo    Este script se cerrará pero los servicios continuarán ejecutándose

:: Limpiar archivos temporales
timeout /t 2 /nobreak >nul
if exist "start_backend.bat" del "start_backend.bat"
if exist "start_frontend.bat" del "start_frontend.bat"

echo.
echo [INFO] 🏁 Script de lanzamiento completado
echo       Los servicios continúan ejecutándose en ventanas separadas
pause 