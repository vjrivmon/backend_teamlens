# ⚡ TeamLens - Inicio Rápido

## 🚀 Lanzar Aplicación

### Opción 1: PowerShell (Recomendado)
```powershell
# Lanzamiento básico
.\launch-teamlens.ps1

# Primera instalación o reinstalación limpia
.\launch-teamlens.ps1 -CleanInstall
```

### Opción 2: Batch (Alternativo)
```cmd
:: Doble clic en el archivo o ejecutar:
launch-teamlens.bat
```

## 🛑 Detener Aplicación

```powershell
# Parada controlada
.\stop-teamlens.ps1

# Parada forzada (inmediata)
.\stop-teamlens.ps1 -Force
```

## 🔗 URLs de Acceso

- **Frontend**: http://localhost:4200
- **Backend**: http://localhost:3000
- **MongoDB**: localhost:27017

## 📋 Prerequisitos Mínimos

1. ✅ Node.js 18+
2. ✅ MongoDB ejecutándose
3. ✅ Puertos 3000 y 4200 disponibles

## 🆘 Problemas Comunes

### Error de puerto ocupado:
```powershell
.\stop-teamlens.ps1 -Force
.\launch-teamlens.ps1
```

### Error de dependencias:
```powershell
.\launch-teamlens.ps1 -CleanInstall
```

### MongoDB no conecta:
```cmd
# Windows Service
net start MongoDB

# Docker
docker start teamlens-mongo
```

---
*Para documentación completa, consulte `LAUNCHER_README.md`* 