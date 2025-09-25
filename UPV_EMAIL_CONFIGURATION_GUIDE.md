# 📧 Guía de Configuración UPV - TeamLens Email System

## 🎯 Resumen Ejecutivo

**¡Tu sistema YA soporta dominios UPV completamente!** Solo necesitas configurar las credenciales correctas. No requiere cambios de código.

## 🔍 Estado Actual

### ✅ Lo que YA tienes:
- Sistema multiproveedor enterprise-grade
- Detección automática de dominios UPV (@upv.es, @epsg.upv.es, @alumno.upv.es)
- Rotación automática entre proveedores
- Límites diarios y fallback automático
- Templates HTML profesionales

### 🔧 Lo que necesitas:
Solo configurar las variables de entorno para proveedores UPV.

## 📋 Opciones de Configuración

### Opción 1: Office365/Outlook (RECOMENDADO)
**Ventajas**: Hasta 10,000 emails/día, alta disponibilidad, fácil configuración

```bash
# Agregar a tu .env.production:
OUTLOOK_EMAIL="teamlens@upv.es"
OUTLOOK_PASSWORD="tu-password-de-aplicacion"
OUTLOOK_FROM="noreply-teamlens@upv.es"
```

### Opción 2: SMTP UPV Directo
**Ventajas**: Control total, sin límites externos

```bash
# Agregar a tu .env.production:
UPV_SMTP_HOST="smtp.upv.es"
UPV_SMTP_PORT="587"
UPV_SMTP_SECURE="false"
UPV_SMTP_USER="teamlens@upv.es"
UPV_SMTP_PASSWORD="tu-password-institucional"
UPV_SMTP_FROM="noreply-teamlens@upv.es"
UPV_SMTP_DAILY_LIMIT="5000"
```

## 🎯 Cómo Funciona el Sistema

Tu código YA hace esta lógica automáticamente:

1. **Email a @upv.es** → Busca SMTP UPV → Busca Outlook → Busca servicios profesionales → Fallback Gmail
2. **Email a otros dominios** → Usa cualquier proveedor disponible

## 🚀 Pasos para Implementar

### Paso 1: Obtener Credenciales UPV
Contacta con IT de la UPV para:
- [ ] Email institucional para la aplicación
- [ ] Password de aplicación (no tu password personal)
- [ ] Confirmación de servidor SMTP (si usas opción 2)

### Paso 2: Configurar Variables de Entorno
```bash
# En tu servidor de producción, edita .env.production
nano .env.production

# Agrega las variables de la Opción 1 o 2
```

### Paso 3: Reiniciar Aplicación
```bash
# Tu aplicación detectará automáticamente los nuevos proveedores
sudo systemctl restart teamlens-backend
```

### Paso 4: Verificar Logs
```bash
# Deberías ver en los logs:
# "📧 [EmailService] Proveedores configurados: X"
# "✅ [EmailService] Usando SMTP UPV para dominio upv.es"
```

## 🧪 Testing en Desarrollo

Para probar localmente antes de producción:

```bash
# En .env-dev, agrega las mismas variables
# Luego ejecuta el script de pruebas:
node test-upv-email-config.js
```

## ⚡ Impacto Inmediato

- **Tiempo implementación**: 15 minutos (solo configuración)
- **Riesgo**: MÍNIMO (sin cambios de código)
- **Beneficio**: Hasta 10,000 emails UPV/día vs 500 Gmail
- **Rollback**: Instantáneo (comentar variables)

## 🛡️ Plan de Despliegue Seguro

1. **Desarrollo**: Probar con credenciales de test
2. **Logs**: Verificar que detecta nuevos proveedores
3. **Producción**: Agregar variables y reiniciar
4. **Monitoreo**: Verificar logs de selección de proveedor
5. **Rollback**: Si hay problemas, comentar variables UPV

## 📊 Variables de Entorno Completas

```bash
# ===== CONFIGURACIÓN ACTUAL (Gmail) =====
EMAIL_USER="tu-gmail@gmail.com"
EMAIL_PASSWORD="tu-app-password"
EMAIL_FROM="tu-gmail@gmail.com"

# ===== NUEVA CONFIGURACIÓN UPV =====

# Opción 1: Office365 (RECOMENDADO)
OUTLOOK_EMAIL="teamlens@upv.es"
OUTLOOK_PASSWORD="password-de-aplicacion"
OUTLOOK_FROM="noreply-teamlens@upv.es"

# Opción 2: SMTP UPV Directo (ALTERNATIVO)
UPV_SMTP_HOST="smtp.upv.es"
UPV_SMTP_PORT="587"
UPV_SMTP_SECURE="false"
UPV_SMTP_REQUIRE_TLS="true"
UPV_SMTP_USER="teamlens@upv.es"
UPV_SMTP_PASSWORD="password-institucional"
UPV_SMTP_FROM="noreply-teamlens@upv.es"
UPV_SMTP_DAILY_LIMIT="5000"

# ===== OTRAS CONFIGURACIONES =====
FRONTEND_URL="https://tu-dominio.upv.es"
NODE_ENV="production"
```

## ❓ FAQs

**Q: ¿Necesito cambiar código?**
A: ¡NO! Tu sistema ya soporta UPV completamente.

**Q: ¿Qué pasa si no configuro UPV?**
A: Seguirá funcionando con Gmail como ahora.

**Q: ¿Puedo tener Gmail Y UPV?**
A: ¡SÍ! El sistema usará UPV para @upv.es y Gmail para otros dominios.

**Q: ¿Cómo sé que funciona?**
A: Los logs mostrarán "Usando SMTP UPV para dominio upv.es".

## 🆘 Troubleshooting

| Problema | Causa | Solución |
|----------|-------|----------|
| No detecta proveedores UPV | Variables mal escritas | Verificar nombres exactos |
| Emails UPV fallan | Credenciales incorrectas | Verificar con IT UPV |
| Sigue usando Gmail | Variables no cargadas | Reiniciar aplicación |

## 🎉 Conclusión

**¡Tu equipo hizo un trabajo excepcional!** Tienes un sistema enterprise que ya maneja todo esto automáticamente. Solo necesitas "encender" las capacidades UPV que ya están built-in.

**Próximo paso**: Contactar IT UPV para credenciales → 15 minutos de configuración → ¡Listo!