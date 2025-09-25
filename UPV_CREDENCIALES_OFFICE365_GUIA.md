# 🔐 Guía Paso a Paso: Credenciales Office365 UPV para TeamLens

## 🎯 Lo que necesitas obtener

Para que TeamLens envíe emails usando Office365 de la UPV, necesitas:
1. **Email institucional**: Una cuenta de aplicación (no tu cuenta personal)
2. **Password de aplicación**: No es tu password normal, es especial para aplicaciones

## 📋 Opción A: Usar tu cuenta institucional existente

### Paso 1: Generar Password de Aplicación

#### Si tienes acceso directo a Office365 UPV:
1. **Inicia sesión** en [https://portal.office.com](https://portal.office.com) con tu cuenta UPV
2. Ve a **"Mi cuenta"** → **"Seguridad"** → **"Configuración de seguridad adicional"**
3. Busca **"Contraseñas de aplicación"** o **"App Passwords"**
4. Haz clic en **"Crear nueva contraseña de aplicación"**
5. Nombra la aplicación: **"TeamLens Email Service"**
6. **¡GUARDA LA CONTRASEÑA!** Solo se muestra una vez

#### Si no tienes acceso directo:
Necesitarás contactar al **Servicio de Informática UPV**:
- **Email**: [asic@upv.es](mailto:asic@upv.es)
- **Teléfono**: 96 387 70 00
- **Portal**: [https://www.upv.es/contenidos/ASIC/](https://www.upv.es/contenidos/ASIC/)

### Paso 2: Configurar Variables
```bash
# En tu .env-dev y .env.production:
OUTLOOK_EMAIL="tu-email@upv.es"           # Tu email UPV actual
OUTLOOK_PASSWORD="la-password-de-app"     # La password generada en Paso 1
OUTLOOK_FROM="noreply-teamlens@upv.es"    # Email que aparecerá como remitente
```

## 📋 Opción B: Solicitar cuenta de aplicación dedicada (RECOMENDADO)

### ¿Por qué es mejor una cuenta dedicada?
- ✅ No afecta tu cuenta personal
- ✅ Mejor para auditoría y logs
- ✅ Límites de envío independientes
- ✅ Más profesional

### Paso 1: Contactar ASIC UPV
Escribe un email a **asic@upv.es** con esta plantilla:

```
Asunto: Solicitud de cuenta Office365 para aplicación TeamLens

Estimado equipo ASIC,

Solicito la creación de una cuenta institucional Office365 para el sistema
TeamLens (plataforma educativa de gestión de equipos).

DETALLES DE LA SOLICITUD:
- Aplicación: TeamLens (sistema interno UPV)
- Propósito: Envío automático de emails educativos
- Tipo de emails: Invitaciones a estudiantes, notificaciones, recordatorios
- Volumen estimado: 100-500 emails/día
- Responsable técnico: [Tu nombre] ([tu-email@upv.es])

DATOS SOLICITADOS:
- Email institucional: teamlens@upv.es (o similar)
- Configuración SMTP habilitada
- Permisos para envío automático de aplicaciones

Esta cuenta se utilizará exclusivamente para comunicaciones automáticas
del sistema educativo TeamLens.

Quedo a disposición para cualquier documentación adicional.

Saludos,
[Tu nombre]
[Tu cargo/departamento]
[Tu teléfono]
```

### Paso 2: Una vez obtengas las credenciales
```bash
# En tu .env-dev y .env.production:
OUTLOOK_EMAIL="teamlens@upv.es"              # La cuenta que te asignen
OUTLOOK_PASSWORD="password-de-aplicacion"    # Password que te proporcionen
OUTLOOK_FROM="TeamLens UPV <teamlens@upv.es>"  # Nombre profesional
```

## 🧪 Opción C: Testing rápido con tu cuenta personal (SOLO PARA PRUEBAS)

### ⚠️ IMPORTANTE: Solo para verificar que funciona

Si necesitas probar rápidamente antes de obtener las credenciales oficiales:

```bash
# TEMPORAL - Solo para testing:
OUTLOOK_EMAIL="tu-email-personal@upv.es"
OUTLOOK_PASSWORD="tu-password-normal"        # ⚠️ NO recomendado para producción
OUTLOOK_FROM="tu-email-personal@upv.es"
```

**PERO**: Office365 puede requerir autenticación de dos factores, lo que bloquearía la aplicación.

## 📞 Contactos UPV para Dudas

### ASIC (Área de Sistemas de Información y Comunicaciones)
- **Email**: [asic@upv.es](mailto:asic@upv.es)
- **Teléfono**: 96 387 70 00
- **Horario**: L-V 8:00-15:00
- **Portal**: [https://www.upv.es/contenidos/ASIC/](https://www.upv.es/contenidos/ASIC/)

### Para consultas específicas sobre cuentas:
- **Portal de incidencias**: [https://intranet.upv.es](https://intranet.upv.es)
- **Manual de usuario Office365 UPV**: Disponible en intranet

## 🛠️ Configuración Técnica Detallada

### Configuración SMTP Office365 UPV:
```bash
# Datos técnicos que necesitas:
SMTP_HOST="smtp.office365.com"
SMTP_PORT="587"
SMTP_SECURE="false"          # Usar STARTTLS
SMTP_REQUIRE_TLS="true"      # TLS requerido
```

### Tu configuración final:
```bash
# Variables para TeamLens:
OUTLOOK_EMAIL="teamlens@upv.es"                    # Cuenta obtenida
OUTLOOK_PASSWORD="xyz123abc456"                    # Password de aplicación
OUTLOOK_FROM="TeamLens UPV <noreply@upv.es>"      # Remitente profesional

# Opcional - URLs del sistema:
FRONTEND_URL="https://teamlens.upv.es"             # Tu dominio real
```

## 🚀 Pasos Siguientes

### Después de obtener las credenciales:

1. **Configurar variables en desarrollo**:
   ```bash
   nano .env-dev
   # Agregar las variables OUTLOOK_*
   ```

2. **Probar la configuración**:
   ```bash
   node test-upv-email-config.js
   # Debe mostrar "✅ Proveedor Outlook/Office365 iniciado"
   ```

3. **Probar envío real en desarrollo**:
   ```bash
   npm run dev:local
   # Probar login/registro para generar emails
   ```

4. **Si funciona, configurar producción**:
   ```bash
   # En el servidor:
   nano .env.production
   # Agregar las mismas variables OUTLOOK_*
   sudo systemctl restart teamlens-backend
   ```

## ❓ FAQs Específicas UPV

**Q: ¿Puedo usar mi email personal @upv.es?**
A: Para testing sí, para producción mejor una cuenta dedicada.

**Q: ¿ASIC me dará las credenciales inmediatamente?**
A: Normalmente tardan 1-3 días laborables para cuentas de aplicación.

**Q: ¿Qué pasa si tengo 2FA habilitado?**
A: Necesitarás password de aplicación específica, no tu password normal.

**Q: ¿Puedo usar dominios personalizados como @teamlens.upv.es?**
A: Posiblemente, consulta con ASIC sobre subdominios disponibles.

## 🔒 Seguridad y Buenas Prácticas

1. **Nunca subas las credenciales a Git**
2. **Usa variables de entorno siempre**
3. **La password de aplicación es diferente a tu password normal**
4. **Pide cuenta dedicada para producción**
5. **Documenta quién tiene acceso a las credenciales**

## 🎉 Una vez configurado

Tu sistema automáticamente:
- ✅ Usará Office365 para todos los emails @upv.es
- ✅ Tendrá límite de 10,000 emails/día
- ✅ Mantendrá Gmail como backup
- ✅ Logs mostrarán "Usando Outlook/Office365 para dominio upv.es"

¿Necesitas ayuda con algún paso específico?