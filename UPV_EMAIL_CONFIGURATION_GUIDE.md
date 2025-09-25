# 🎓 Guía de Configuración de Email UPV - TeamLens

## 📋 Resumen Ejecutivo

**IMPORTANTE**: Tu sistema de email **YA SOPORTA dominios UPV** nativamente. El sistema v3.0 incluye detección automática y priorización de proveedores para correos UPV.

**El problema no es técnico, es de configuración** - solo necesitas configurar las credenciales adecuadas.

---

## 🎯 Configuración Paso a Paso para UPV

### Opción 1: Outlook/Office365 (RECOMENDADO) 🌟

La mayoría de instituciones UPV usan Office365. Esta es la opción más confiable:

```bash
# En tu archivo .env.production
OUTLOOK_EMAIL="tu-usuario@upv.es"
OUTLOOK_PASSWORD="tu-contraseña-institucional"
OUTLOOK_FROM="noreply-teamlens@upv.es"
```

**Ventajas:**
- ✅ Límite alto: 10,000 emails/día
- ✅ Infraestructura robusta de Microsoft
- ✅ Compatibilidad completa con dominios UPV
- ✅ Autenticación institucional

### Opción 2: SMTP UPV Directo

Si tienes acceso directo al servidor SMTP de UPV:

```bash
# En tu archivo .env.production
UPV_SMTP_HOST="smtp.upv.es"
UPV_SMTP_PORT="587"
UPV_SMTP_SECURE="false"
UPV_SMTP_REQUIRE_TLS="true"
UPV_SMTP_USER="tu-usuario@upv.es"
UPV_SMTP_PASSWORD="tu-contraseña-institucional"
UPV_SMTP_FROM="noreply-teamlens@upv.es"
UPV_SMTP_DAILY_LIMIT="5000"
```

**Ventajas:**
- ✅ Control directo
- ✅ Límite configurable
- ✅ Integración nativa con UPV

---

## 🔍 Cómo Funciona la Detección Automática

El sistema **automáticamente detecta** destinatarios UPV:

```typescript
// Dominios detectados automáticamente:
- @upv.es
- @epsg.upv.es
- @alumno.upv.es
```

**Prioridad de Proveedores para UPV:**
1. 🥇 SMTP UPV Corporativo (si está configurado)
2. 🥈 Outlook/Office365 (si está configurado)
3. 🥉 SendGrid/Mailgun (servicios profesionales)
4. 🔄 Cualquier proveedor disponible (fallback)

---

## 🚀 Pasos de Implementación Inmediata

### 1. Identificar Tus Credenciales UPV

```bash
# Consulta con tu departamento IT de UPV:
# - ¿Usáis Office365?
# - ¿Tenéis servidor SMTP interno?
# - ¿Cuáles son las credenciales para aplicaciones?
```

### 2. Configurar Variables de Entorno

**Para DESARROLLO** (`.env-dev`):
```bash
# Mantener Gmail para desarrollo
EMAIL_USER="teamlens.app@gmail.com"
EMAIL_PASSWORD="wobx oabi gxiw nlco"

# Agregar UPV para pruebas
OUTLOOK_EMAIL="tu-email-test@upv.es"
OUTLOOK_PASSWORD="tu-password-test"
```

**Para PRODUCCIÓN** (`.env.production`):
```bash
# Configuración completa UPV
NODE_ENV="production"
FRONTEND_URL="https://teamlens.upv.es"

# Proveedor principal UPV
OUTLOOK_EMAIL="teamlens@upv.es"
OUTLOOK_PASSWORD="password-seguro-institucional"
OUTLOOK_FROM="TeamLens UPV <noreply@upv.es>"

# Backup Gmail (opcional)
EMAIL_USER="teamlens.backup@gmail.com"
EMAIL_PASSWORD="backup-password"
```

### 3. Verificar la Configuración

El sistema incluye logs detallados para debugging:

```typescript
// Al iniciar el sistema, verás:
📧 [EmailService] Inicializando servicio de email multiproveedor v3.0...
📧 [EmailService] Entorno: PRODUCCIÓN
📧 [EmailService] Proveedores configurados: 3
  1. Outlook/Office365 (smtp.office365.com)
  2. Gmail Principal (smtp.gmail.com)
  3. SendGrid (smtp.sendgrid.net)
```

### 4. Probar Envío a Dominios UPV

```typescript
// Al enviar a un email UPV, verás:
🎯 [EmailService] Usando Outlook/Office365 para dominio upv.es
📤 [EmailService] Enviando email con Outlook/Office365...
✅ [EmailService] Email enviado exitosamente con Outlook/Office365!
```

---

## 🛡️ Estrategia de Despliegue Seguro

### Fase 1: Testing en Desarrollo
1. Configurar UPV en `.env-dev`
2. Probar con emails UPV reales
3. Verificar logs de priorización
4. Confirmar recepción de emails

### Fase 2: Despliegue Staging
1. Configurar ambiente de staging
2. Probar con volumen real de emails
3. Monitorear límites diarios
4. Validar fallbacks

### Fase 3: Producción
1. Configurar `.env.production`
2. Despliegue gradual
3. Monitoreo continuo de logs
4. Plan de rollback preparado

---

## 📊 Monitoreo y Estadísticas

Tu sistema incluye un endpoint para monitorear proveedores:

```typescript
// Endpoint disponible:
GET /api/email/stats

// Respuesta ejemplo:
{
  "providers": [
    {
      "name": "Outlook/Office365",
      "host": "smtp.office365.com",
      "sentToday": 45,
      "dailyLimit": 10000,
      "remaining": 9955,
      "lastReset": "2024-01-15T00:00:00.000Z"
    }
  ]
}
```

---

## 🔧 Resolución de Problemas Comunes

### Problema: "Solo funciona con Gmail"
**Causa:** Variables UPV no configuradas
**Solución:** Configurar `OUTLOOK_EMAIL` y `OUTLOOK_PASSWORD`

### Problema: "Autenticación fallida"
**Causa:** Credenciales incorrectas o 2FA
**Solución:** Verificar credenciales y configurar app password

### Problema: "Límite alcanzado"
**Causa:** Proveedor agotó límite diario
**Solución:** El sistema rotará automáticamente al siguiente

### Problema: "Emails no llegan a UPV"
**Causa:** Filtros de spam o configuración SMTP
**Solución:** Verificar configuración TLS y certificados

---

## 📈 Beneficios Empresariales del Sistema Actual

### Escalabilidad
- ✅ Soporte para múltiples proveedores
- ✅ Rotación automática
- ✅ Límites configurables por proveedor

### Confiabilidad
- ✅ Fallback automático
- ✅ Reintentos con diferentes proveedores
- ✅ Logging detallado para debugging

### Profesionalismo
- ✅ Templates HTML corporativos
- ✅ Branding consistente
- ✅ Comunicación unificada

---

## 🎯 Próximos Pasos Inmediatos

1. **CONTACTAR IT UPV** - Obtener credenciales SMTP oficiales
2. **CONFIGURAR VARIABLES** - Agregar configuración UPV a `.env.production`
3. **PROBAR EN DESARROLLO** - Validar funcionamiento antes de producción
4. **MONITOREAR LOGS** - Verificar selección automática de proveedores
5. **DOCUMENTAR PROCESO** - Crear runbook para el equipo

---

## 🚨 Importante para Producción

**NUNCA cambies el código existente** - el sistema ya funciona perfectamente. Solo necesitas:

1. ✅ Configurar variables de entorno UPV
2. ✅ Obtener credenciales institucionales
3. ✅ Monitorear logs de funcionamiento
4. ✅ Mantener Gmail como backup

**Tu sistema ya es enterprise-grade y soporta UPV nativamente.**

---

*Documentación generada para TeamLens UPV Email Support*
*Fecha: 2024-01-15*