#!/usr/bin/env pwsh

<#
.SYNOPSIS
    Script de lanzamiento para la aplicación TeamLens (Backend)
    
.DESCRIPTION
    Este script automatiza el proceso de instalación, compilación y ejecución
    tanto del frontend (Angular) como del backend (Node.js/TypeScript) de TeamLens.
    Está diseñado para entornos de desarrollo local y debe ejecutarse desde 
    la carpeta del backend (backend_teamlens).
    
.AUTHOR
    DevOps Team - TeamLens Project
    
.VERSION
    2.0.0
    
.NOTES
    Requisitos previos:
    - Node.js versión 18+ instalado
    - MongoDB ejecutándose en localhost:27017
    - Puertos 4200 (frontend) y 3000 (backend) disponibles
    - Frontend ubicado en directorio hermano: ../frontend_teamlens
    
.EXECUTION
    Ejecutar desde la carpeta backend_teamlens:
    .\launch-teamlens.ps1
#>

param(
    [switch]$SkipInstall = $false,  # Omitir instalación de dependencias
    [switch]$CleanInstall = $false, # Forzar reinstalación limpia
    [switch]$Verbose = $false,      # Salida detallada
    [switch]$BackendOnly = $false   # Solo iniciar backend (sin frontend)
)

# Configuración de colores para output profesional
$ErrorColor = "Red"
$SuccessColor = "Green" 
$InfoColor = "Cyan"
$WarningColor = "Yellow"

# Rutas de los proyectos (relativas desde backend_teamlens)
$BackendPath = "."                      # Directorio actual (backend_teamlens)
$FrontendPath = "..\frontend_teamlens"  # Directorio hermano
$RootPath = Get-Location

# Variables de configuración
$BackendPort = 3000
$FrontendPort = 4200

function Write-ColoredOutput {
    param(
        [string]$Message,
        [string]$Color = "White",
        [string]$Prefix = ""
    )
    
    $timestamp = Get-Date -Format "HH:mm:ss"
    Write-Host "[$timestamp] $Prefix$Message" -ForegroundColor $Color
}

function Test-ExecutionContext {
    Write-ColoredOutput "🔍 Validando contexto de ejecución..." $InfoColor
    
    # Verificar que estamos en la carpeta correcta (debe contener package.json del backend)
    if (-not (Test-Path "package.json")) {
        Write-ColoredOutput "❌ Error: No se encontró package.json en el directorio actual" $ErrorColor
        Write-ColoredOutput "   Este script debe ejecutarse desde la carpeta backend_teamlens" $WarningColor
        exit 1
    }
    
    # Verificar que el package.json corresponde al backend
    $packageContent = Get-Content "package.json" | ConvertFrom-Json
    if ($packageContent.name -ne "node3ts") {
        Write-ColoredOutput "❌ Error: Este no parece ser el directorio del backend de TeamLens" $ErrorColor
        Write-ColoredOutput "   Asegúrese de ejecutar desde la carpeta backend_teamlens" $WarningColor
        exit 1
    }
    
    Write-ColoredOutput "✅ Contexto de ejecución válido: Backend TeamLens" $SuccessColor
    
    # Verificar si existe el frontend (solo advertencia, no error)
    if (-not $BackendOnly -and -not (Test-Path $FrontendPath)) {
        Write-ColoredOutput "⚠️  Advertencia: No se encontró el directorio del frontend en $FrontendPath" $WarningColor
        Write-ColoredOutput "   El script continuará solo con el backend" $InfoColor
        Write-ColoredOutput "   Para incluir frontend, asegúrese de que esté en: $FrontendPath" $InfoColor
        $script:BackendOnly = $true
    } elseif (-not $BackendOnly) {
        Write-ColoredOutput "✅ Frontend detectado en: $FrontendPath" $SuccessColor
    }
}

function Test-Prerequisites {
    Write-ColoredOutput "🔍 Verificando prerequisitos del sistema..." $InfoColor
    
    # Verificar Node.js
    try {
        $nodeVersion = node --version 2>$null
        if ($nodeVersion) {
            Write-ColoredOutput "✅ Node.js detectado: $nodeVersion" $SuccessColor
        } else {
            throw "Node.js no encontrado"
        }
    }
    catch {
        Write-ColoredOutput "❌ Error: Node.js no está instalado o no está en el PATH" $ErrorColor
        Write-ColoredOutput "   Instale Node.js desde https://nodejs.org/" $WarningColor
        exit 1
    }
    
    # Verificar npm
    try {
        $npmVersion = npm --version 2>$null
        Write-ColoredOutput "✅ npm detectado: v$npmVersion" $SuccessColor
    }
    catch {
        Write-ColoredOutput "❌ Error: npm no está disponible" $ErrorColor
        exit 1
    }
    
    # Verificar y liberar puertos automáticamente
    $portsToCheck = @($BackendPort)
    if (-not $BackendOnly) {
        $portsToCheck += $FrontendPort
    }
    
    foreach ($port in $portsToCheck) {
        $connections = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
        
        if ($connections) {
            Write-ColoredOutput "⚠️  Puerto $port ocupado. Liberando automáticamente..." $WarningColor
            
            foreach ($conn in $connections) {
                if ($conn.State -eq "Listen") {
                    try {
                        $process = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
                        if ($process) {
                            Write-ColoredOutput "🛑 Terminando proceso PID:$($process.Id) ($($process.ProcessName)) en puerto $port" $InfoColor
                            $process.Kill()
                            Write-ColoredOutput "✅ Proceso terminado exitosamente" $SuccessColor
                        }
                    }
                    catch {
                        Write-ColoredOutput "⚠️  No se pudo terminar proceso en puerto $port" $WarningColor
                    }
                }
            }
            
            # Esperar un momento para que el puerto se libere
            Start-Sleep -Seconds 2
            
            # Verificar que el puerto está libre
            $stillInUse = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
            if ($stillInUse) {
                Write-ColoredOutput "❌ No se pudo liberar el puerto $port" $ErrorColor
            } else {
                Write-ColoredOutput "✅ Puerto $port liberado correctamente" $SuccessColor
            }
        } else {
            Write-ColoredOutput "✅ Puerto $port disponible" $SuccessColor
        }
    }
}

function Setup-EmailService {
    Write-ColoredOutput "📧 Configurando servicio de email para desarrollo..." $InfoColor
    
    $envPath = ".env-dev"  # Ahora buscamos en el directorio actual
    
    if (Test-Path $envPath) {
        $envContent = Get-Content $envPath
        
        # Verificar si las credenciales de email son las de prueba
        $emailUser = ($envContent | Where-Object { $_ -like "EMAIL_USER=*" }) -replace 'EMAIL_USER=', '' -replace '"', ''
        $emailPass = ($envContent | Where-Object { $_ -like "EMAIL_PASSWORD=*" }) -replace 'EMAIL_PASSWORD=', '' -replace '"', ''
        
        if ($emailUser -eq "dalfamosni@mail.com" -or $emailPass -eq "1234") {
            Write-ColoredOutput "⚠️  Detectadas credenciales de email de prueba" $WarningColor
            Write-ColoredOutput "📧 Forzando modo debug de email..." $InfoColor
            
            # Configurar para forzar debug de emails
            $newEnvContent = $envContent | ForEach-Object {
                if ($_ -like "EMAIL_USER=*") {
                    'EMAIL_USER="test@teamlens-dev.local"'
                } elseif ($_ -like "EMAIL_PASSWORD=*") {
                    'EMAIL_PASSWORD="invalid-password-force-error"'
                } else {
                    $_
                }
            }
            
            # Forzar configuración que cause errores para mostrar emails en consola
            $hasEmailDebug = $envContent | Where-Object { $_ -like "*EMAIL_DEBUG*" }
            if (-not $hasEmailDebug) {
                $newEnvContent += ""
                $newEnvContent += "# Forzar debug de email - emails aparecerán en consola"
                $newEnvContent += 'EMAIL_DEBUG="true"'
                $newEnvContent += 'NODE_ENV="development"'
            }
            
            $newEnvContent | Set-Content $envPath
            Write-ColoredOutput "✅ Email configurado para debug (errores mostrarán contenido)" $SuccessColor
            Write-ColoredOutput "📝 Los emails aparecerán en la consola cuando fallen" $InfoColor
        } else {
            Write-ColoredOutput "✅ Configuración de email válida detectada" $SuccessColor
        }
    } else {
        Write-ColoredOutput "⚠️  Archivo .env-dev no encontrado, usando configuración por defecto" $WarningColor
    }
}

function Install-Dependencies {
    param([string]$ProjectPath, [string]$ProjectName)
    
    $currentLocation = Get-Location
    Set-Location $ProjectPath
    
    if ($CleanInstall -and (Test-Path "node_modules")) {
        Write-ColoredOutput "🧹 Limpiando instalación previa de $ProjectName..." $InfoColor
        Remove-Item -Recurse -Force "node_modules" -ErrorAction SilentlyContinue
        Remove-Item -Force "package-lock.json" -ErrorAction SilentlyContinue
    }
    
    if (-not (Test-Path "node_modules") -or $CleanInstall) {
        Write-ColoredOutput "📦 Instalando dependencias de $ProjectName..." $InfoColor
        
        $installArgs = @("install")
        if ($Verbose) { $installArgs += "--verbose" }
        
        $installProcess = Start-Process -FilePath "cmd.exe" -ArgumentList (@("/c", "npm") + $installArgs) -NoNewWindow -PassThru -Wait
        
        if ($installProcess.ExitCode -eq 0) {
            Write-ColoredOutput "✅ Dependencias de $ProjectName instaladas correctamente" $SuccessColor
        } else {
            Write-ColoredOutput "❌ Error instalando dependencias de $ProjectName" $ErrorColor
            Set-Location $currentLocation
            exit 1
        }
    } else {
        Write-ColoredOutput "✅ Dependencias de $ProjectName ya están instaladas" $SuccessColor
    }
    
    Set-Location $currentLocation
}

function Build-Backend {
    Write-ColoredOutput "🔨 Compilando backend TypeScript..." $InfoColor
    
    # Ya estamos en el directorio del backend, no necesitamos cambiar
    
    # Limpiar build anterior si existe
    if (Test-Path "build") {
        Remove-Item -Recurse -Force "build" -ErrorAction SilentlyContinue
    }
    
    $buildProcess = Start-Process -FilePath "cmd.exe" -ArgumentList @("/c", "npm", "run", "tsc") -NoNewWindow -PassThru -Wait
    
    if ($buildProcess.ExitCode -eq 0) {
        Write-ColoredOutput "✅ Backend compilado exitosamente" $SuccessColor
    } else {
        Write-ColoredOutput "❌ Error compilando el backend" $ErrorColor
        Write-ColoredOutput "⚠️  Revise los errores de TypeScript arriba" $WarningColor
        Write-ColoredOutput "💡 Puede continuar con --SkipBuild si los errores no son críticos" $InfoColor
        exit 1
    }
}

function Start-Services {
    Write-ColoredOutput "🚀 Iniciando servicios de TeamLens..." $InfoColor
    
    # Array para almacenar los procesos
    $processes = @()
    $currentLocation = Get-Location
    
    try {
        # Iniciar Backend (ya estamos en el directorio correcto)
        Write-ColoredOutput "🖥️  Iniciando backend en puerto $BackendPort..." $InfoColor
        $backendProcess = Start-Process -FilePath "cmd.exe" -ArgumentList @("/c", "npm", "run", "dev") -PassThru
        $processes += $backendProcess
        
        # Esperar un momento para que el backend se inicie
        Start-Sleep -Seconds 3
        
        # Iniciar Frontend solo si no es BackendOnly y existe
        if (-not $BackendOnly -and (Test-Path $FrontendPath)) {
            Write-ColoredOutput "🌐 Iniciando frontend en puerto $FrontendPort..." $InfoColor
            Set-Location $FrontendPath
            $frontendProcess = Start-Process -FilePath "cmd.exe" -ArgumentList @("/c", "npm", "start") -PassThru
            $processes += $frontendProcess
            Set-Location $currentLocation
        } elseif ($BackendOnly) {
            Write-ColoredOutput "⏭️  Modo solo backend: omitiendo frontend" $InfoColor
        }
        
        Write-ColoredOutput "✅ Servicios iniciados correctamente" $SuccessColor
        Write-ColoredOutput "🔗 Backend:  http://localhost:$BackendPort" $InfoColor
        if (-not $BackendOnly -and (Test-Path $FrontendPath)) {
            Write-ColoredOutput "🔗 Frontend: http://localhost:$FrontendPort" $InfoColor
        }
        Write-ColoredOutput "" 
        Write-ColoredOutput "📋 Para detener los servicios, presione Ctrl+C" $WarningColor
        Write-ColoredOutput "📊 Monitoreando procesos..." $InfoColor
        
        # Monitorear procesos
        while ($true) {
            $aliveProcesses = $processes | Where-Object { -not $_.HasExited }
            
            if ($aliveProcesses.Count -eq 0) {
                Write-ColoredOutput "⚠️  Todos los procesos han terminado" $WarningColor
                break
            }
            
            Start-Sleep -Seconds 5
        }
        
    }
    catch {
        Write-ColoredOutput "❌ Error iniciando servicios: $($_.Exception.Message)" $ErrorColor
    }
    finally {
        # Cleanup: Terminar procesos si aún están ejecutándose
        Write-ColoredOutput "🛑 Terminando servicios..." $InfoColor
        
        foreach ($process in $processes) {
            if (-not $process.HasExited) {
                try {
                    $process.Kill()
                    Write-ColoredOutput "✅ Proceso $($process.Id) terminado" $SuccessColor
                }
                catch {
                    Write-ColoredOutput "⚠️  No se pudo terminar el proceso $($process.Id)" $WarningColor
                }
            }
        }
        
        Set-Location $currentLocation
    }
}

function Show-Header {
    Write-Host ""
    Write-Host "╔══════════════════════════════════════════════════════════════╗" -ForegroundColor $InfoColor
    Write-Host "║                     TEAMLENS LAUNCHER                        ║" -ForegroundColor $InfoColor  
    Write-Host "║                  Sistema de Gestión de Equipos               ║" -ForegroundColor $InfoColor
    Write-Host "║                                                              ║" -ForegroundColor $InfoColor
    Write-Host "║  🚀 Lanzador Backend para Entorno de Desarrollo             ║" -ForegroundColor $InfoColor
    Write-Host "║  📂 Ejecutándose desde: backend_teamlens                    ║" -ForegroundColor $InfoColor
    Write-Host "╚══════════════════════════════════════════════════════════════╝" -ForegroundColor $InfoColor
    Write-Host ""
}

# ===============================
# EJECUCIÓN PRINCIPAL
# ===============================

try {
    Show-Header
    
    # Verificar contexto de ejecución
    Test-ExecutionContext
    
    # Verificar prerequisitos del sistema
    Test-Prerequisites
    
    # Configurar servicio de email para desarrollo
    Setup-EmailService
    
    # Instalar dependencias si es necesario
    if (-not $SkipInstall) {
        Install-Dependencies -ProjectPath $BackendPath -ProjectName "Backend"
        
        if (-not $BackendOnly -and (Test-Path $FrontendPath)) {
            Install-Dependencies -ProjectPath $FrontendPath -ProjectName "Frontend"
        }
    } else {
        Write-ColoredOutput "⏭️  Omitiendo instalación de dependencias" $InfoColor
    }
    
    # Compilar backend
    Build-Backend
    
    # Iniciar servicios
    Start-Services
    
}
catch {
    Write-ColoredOutput "💥 Error crítico en el script: $($_.Exception.Message)" $ErrorColor
    Write-ColoredOutput "📍 Línea: $($_.InvocationInfo.ScriptLineNumber)" $ErrorColor
    exit 1
}
finally {
    Write-ColoredOutput "🏁 Script finalizado" $InfoColor
    Set-Location $RootPath
} 