# ====================================================================
# Script PowerShell para Lanzamiento Automático de Tests - TeamLens
# 
# @author DevOps Senior - TeamLens Testing Suite
# @version 1.0.0
# @description Suite completa de ejecución de tests con reporting avanzado
# ====================================================================

# Configuración de colores para output profesional
$Host.UI.RawUI.WindowTitle = "TeamLens - Test Suite Runner"

function Write-Header {
    param([string]$Message)
    Write-Host ""
    Write-Host "============================================================" -ForegroundColor Cyan
    Write-Host " $Message" -ForegroundColor White
    Write-Host "============================================================" -ForegroundColor Cyan
    Write-Host ""
}

function Write-Success {
    param([string]$Message)
    Write-Host "✅ $Message" -ForegroundColor Green
}

function Write-Warning {
    param([string]$Message)
    Write-Host "⚠️  $Message" -ForegroundColor Yellow
}

function Write-Error {
    param([string]$Message)
    Write-Host "❌ $Message" -ForegroundColor Red
}

function Write-Info {
    param([string]$Message)
    Write-Host "ℹ️  $Message" -ForegroundColor Blue
}

# Función para verificar si Node.js está instalado
function Test-NodeJS {
    try {
        $nodeVersion = node --version 2>$null
        if ($nodeVersion) {
            Write-Success "Node.js detectado: $nodeVersion"
            return $true
        }
    }
    catch {
        Write-Error "Node.js no está instalado o no está en el PATH"
        Write-Info "Instala Node.js desde: https://nodejs.org/"
        return $false
    }
    return $false
}

# Función para verificar si las dependencias están instaladas
function Test-Dependencies {
    if (Test-Path "node_modules") {
        Write-Success "Dependencias encontradas"
        return $true
    }
    else {
        Write-Warning "Dependencias no encontradas. Instalando..."
        return $false
    }
}

# Función para instalar dependencias
function Install-Dependencies {
    Write-Info "Instalando dependencias de testing..."
    try {
        npm install
        if ($LASTEXITCODE -eq 0) {
            Write-Success "Dependencias instaladas correctamente"
            return $true
        }
        else {
            Write-Error "Error instalando dependencias"
            return $false
        }
    }
    catch {
        Write-Error "Error ejecutando npm install: $($_.Exception.Message)"
        return $false
    }
}

# Función para ejecutar un tipo específico de tests
function Invoke-TestSuite {
    param(
        [string]$TestType,
        [string]$Description,
        [string]$Command
    )
    
    Write-Header "$Description"
    Write-Info "Ejecutando: $Command"
    
    try {
        $startTime = Get-Date
        
        # Usar PowerShell para ejecutar comandos npm/npx directamente
        $result = Invoke-Expression $Command
        $exitCode = $LASTEXITCODE
        
        $endTime = Get-Date
        $duration = $endTime - $startTime
        
        if ($exitCode -eq 0) {
            Write-Success "$Description completados exitosamente"
            Write-Info "Tiempo de ejecución: $($duration.TotalSeconds.ToString('F2')) segundos"
            return $true
        }
        else {
            Write-Error "$Description fallaron (Exit Code: $exitCode)"
            Write-Warning "Intentando con npx como alternativa..."
            
            # Intentar con npx como fallback
            if ($Command.StartsWith("npm ")) {
                $npxCommand = $Command -replace "npm ", "npx "
                Write-Info "Ejecutando fallback: $npxCommand"
                $result = Invoke-Expression $npxCommand
                $npxExitCode = $LASTEXITCODE
                
                if ($npxExitCode -eq 0) {
                    Write-Success "$Description completados exitosamente (con npx)"
                    return $true
                }
            }
            return $false
        }
    }
    catch {
        Write-Error "Error ejecutando $Description : $($_.Exception.Message)"
        return $false
    }
}

# Función para mostrar reporte de cobertura
function Show-CoverageReport {
    $coverageFile = "coverage\lcov-report\index.html"
    if (Test-Path $coverageFile) {
        Write-Success "Reporte de cobertura generado: $coverageFile"
        $openCoverage = Read-Host "¿Deseas abrir el reporte de cobertura? (s/n)"
        if ($openCoverage -eq "s" -or $openCoverage -eq "S") {
            try {
                Start-Process $coverageFile
                Write-Success "Abriendo reporte de cobertura en el navegador..."
            }
            catch {
                Write-Warning "No se pudo abrir automáticamente. Abre manualmente: $coverageFile"
            }
        }
    }
    else {
        Write-Warning "Reporte de cobertura no encontrado"
    }
}

# Función para limpiar archivos temporales
function Clear-TestArtifacts {
    Write-Info "Limpiando archivos temporales de tests..."
    
    $foldersToClean = @("coverage", ".nyc_output", "test-results")
    
    foreach ($folder in $foldersToClean) {
        if (Test-Path $folder) {
            try {
                Remove-Item $folder -Recurse -Force
                Write-Success "Limpiado: $folder"
            }
            catch {
                Write-Warning "No se pudo limpiar: $folder"
            }
        }
    }
}

# Función principal para mostrar menú
function Show-TestMenu {
    Clear-Host
    Write-Header "TEAMLENS - SUITE DE TESTS ENTERPRISE"
    
    Write-Host "Selecciona el tipo de tests a ejecutar:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "1. 🧪 Ejecutar TODOS los tests" -ForegroundColor White
    Write-Host "2. 🔧 Tests unitarios únicamente" -ForegroundColor White
    Write-Host "3. 🔗 Tests de integración únicamente" -ForegroundColor White
    Write-Host "4. 📊 Tests con reporte de cobertura" -ForegroundColor White
    Write-Host "5. 👀 Tests en modo watch (desarrollo)" -ForegroundColor White
    Write-Host "6. 🧹 Limpiar archivos temporales" -ForegroundColor White
    Write-Host "7. 📋 Verificar configuración del entorno" -ForegroundColor White
    Write-Host "8. ❌ Salir" -ForegroundColor Gray
    Write-Host ""
    
    $choice = Read-Host "Ingresa tu opción (1-8)"
    return $choice
}

# Función para verificar configuración del entorno
function Test-Environment {
    Write-Header "VERIFICACIÓN DEL ENTORNO DE TESTING"
    
    $allGood = $true
    
    # Verificar Node.js
    if (-not (Test-NodeJS)) {
        $allGood = $false
    }
    
    # Verificar npm
    try {
        $npmVersion = npm --version 2>$null
        Write-Success "npm detectado: $npmVersion"
    }
    catch {
        Write-Error "npm no está disponible"
        $allGood = $false
    }
    
    # Verificar archivo package.json
    if (Test-Path "package.json") {
        Write-Success "package.json encontrado"
    }
    else {
        Write-Error "package.json no encontrado"
        $allGood = $false
    }
    
    # Verificar configuración de Jest
    if (Test-Path "jest.config.js") {
        Write-Success "Configuración de Jest encontrada"
    }
    else {
        Write-Warning "jest.config.js no encontrado"
    }
    
    # Verificar directorio de tests
    if (Test-Path "tests") {
        Write-Success "Directorio de tests encontrado"
        $testFiles = Get-ChildItem -Path "tests" -Filter "*.test.ts" -Recurse
        Write-Info "Archivos de test encontrados: $($testFiles.Count)"
    }
    else {
        Write-Error "Directorio de tests no encontrado"
        $allGood = $false
    }
    
    # Verificar Jest
    try {
        $jestVersion = npx jest --version 2>$null
        Write-Success "Jest disponible: v$jestVersion"
    }
    catch {
        Write-Error "Jest no está disponible o instalado"
        Write-Info "Ejecuta: npm install"
        $allGood = $false
    }
    
    # Verificar variables de entorno
    if (Test-Path ".env-dev") {
        Write-Success "Archivo de entorno de desarrollo encontrado"
    }
    else {
        Write-Warning "Archivo .env-dev no encontrado"
    }
    
    if ($allGood) {
        Write-Success "✅ Entorno configurado correctamente para testing"
    }
    else {
        Write-Error "❌ Hay problemas en la configuración del entorno"
    }
    
    return $allGood
}

# ====================================================================
# SCRIPT PRINCIPAL
# ====================================================================

# Verificar que estamos en el directorio correcto
if (-not (Test-Path "package.json")) {
    Write-Error "Este script debe ejecutarse desde el directorio raíz del proyecto backend (donde está package.json)"
    Read-Host "Presiona Enter para salir"
    exit 1
}

# Loop principal del menú
do {
    $choice = Show-TestMenu
    
    switch ($choice) {
        "1" {
            Write-Header "EJECUTANDO TODOS LOS TESTS"
            
            # Verificar e instalar dependencias si es necesario
            if (-not (Test-Dependencies)) {
                if (-not (Install-Dependencies)) {
                    Write-Error "No se pudieron instalar las dependencias"
                    Read-Host "Presiona Enter para continuar"
                    continue
                }
            }
            
            # Verificar que Jest esté disponible
            Write-Info "Verificando disponibilidad de Jest..."
            try {
                $jestVersion = npx jest --version 2>$null
                Write-Success "Jest disponible: v$jestVersion"
            }
            catch {
                Write-Error "Jest no está disponible. Reinstalando dependencias..."
                Install-Dependencies
            }
            
            $success = Invoke-TestSuite -TestType "all" -Description "Suite Completa de Tests" -Command "npx jest"
            
            if ($success) {
                Write-Success "🎉 TODOS LOS TESTS COMPLETADOS EXITOSAMENTE"
            }
            else {
                Write-Error "💥 ALGUNOS TESTS FALLARON - Revisa la salida anterior"
            }
            
            Read-Host "Presiona Enter para continuar"
        }
        
        "2" {
            $success = Invoke-TestSuite -TestType "unit" -Description "Tests Unitarios" -Command "npx jest --testPathPattern=unit"
            Read-Host "Presiona Enter para continuar"
        }
        
        "3" {
            $success = Invoke-TestSuite -TestType "integration" -Description "Tests de Integración" -Command "npx jest --testPathPattern=integration"
            Read-Host "Presiona Enter para continuar"
        }
        
        "4" {
            Write-Header "TESTS CON REPORTE DE COBERTURA"
            
            # Limpiar reportes anteriores
            if (Test-Path "coverage") {
                Remove-Item "coverage" -Recurse -Force -ErrorAction SilentlyContinue
            }
            
            $success = Invoke-TestSuite -TestType "coverage" -Description "Tests con Cobertura" -Command "npx jest --coverage"
            
            if ($success) {
                Show-CoverageReport
            }
            
            Read-Host "Presiona Enter para continuar"
        }
        
        "5" {
            Write-Header "MODO WATCH - DESARROLLO"
            Write-Info "Los tests se ejecutarán automáticamente cuando cambies archivos"
            Write-Warning "Presiona Ctrl+C para salir del modo watch"
            Read-Host "Presiona Enter para iniciar el modo watch"
            
            npx jest --watch
        }
        
        "6" {
            Write-Header "LIMPIEZA DE ARCHIVOS TEMPORALES"
            Clear-TestArtifacts
            Write-Success "Limpieza completada"
            Read-Host "Presiona Enter para continuar"
        }
        
        "7" {
            Test-Environment
            Read-Host "Presiona Enter para continuar"
        }
        
        "8" {
            Write-Header "¡HASTA LUEGO!"
            Write-Success "Gracias por usar la suite de tests de TeamLens"
            break
        }
        
        default {
            Write-Warning "Opción inválida. Por favor selecciona una opción del 1 al 8."
            Start-Sleep -Seconds 2
        }
    }
} while ($choice -ne "8")

# Limpiar pantalla al salir
Clear-Host
Write-Host "🚀 TeamLens Test Suite - ¡Tests que fallan son bugs que no llegaron a producción!" -ForegroundColor Green 