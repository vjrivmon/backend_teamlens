# Test Rápido - Verificación de Jest
# Script simple para verificar que Jest funciona

Write-Host "🧪 VERIFICACIÓN RÁPIDA DE JEST" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan

Write-Host "✅ Ejecutando test simple..." -ForegroundColor Green

npx jest simple.test.ts

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "🎉 ¡JEST FUNCIONA PERFECTAMENTE!" -ForegroundColor Green
    Write-Host "✅ Tu script run-tests.ps1 está listo para usar" -ForegroundColor Green
    Write-Host ""
    Write-Host "Para ejecutar la suite completa:" -ForegroundColor Yellow
    Write-Host ".\run-tests.ps1" -ForegroundColor White
} else {
    Write-Host ""
    Write-Host "❌ Hay un problema con Jest" -ForegroundColor Red
    Write-Host "Exit Code: $LASTEXITCODE" -ForegroundColor Red
} 