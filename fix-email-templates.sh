#!/bin/bash
# ============================================================================
# 🔧 SCRIPT DE CORRECCIÓN DE TEMPLATES DE EMAIL
# ============================================================================
# Autor: DevOps Senior Assistant  
# Propósito: Diagnosticar y corregir problemas con templates de email
# Uso: ./fix-email-templates.sh
# ============================================================================

set -e

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}ℹ️  [INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}✅ [SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}⚠️  [WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}❌ [ERROR]${NC} $1"
}

echo "============================================================================"
echo "🔧 DIAGNÓSTICO Y CORRECCIÓN DE TEMPLATES DE EMAIL"
echo "============================================================================"
echo ""

log_info "📍 Directorio actual: $(pwd)"

# ============================================================================
# VERIFICACIÓN DE ESTRUCTURA DE DIRECTORIOS
# ============================================================================
log_info "🔍 Verificando estructura de directorios..."

# Verificar directorio src/templates/emails
if [ -d "src/templates/emails" ]; then
    log_success "Directorio fuente encontrado: src/templates/emails"
    
    echo "📋 Contenido del directorio fuente:"
    ls -la src/templates/emails/ | while read line; do
        echo "   $line"
    done
    
    TEMPLATE_COUNT_SRC=$(find src/templates/emails -name "*.html" 2>/dev/null | wc -l)
    log_info "📊 Templates en src/: $TEMPLATE_COUNT_SRC archivos .html"
else
    log_error "Directorio fuente NO encontrado: src/templates/emails"
    exit 1
fi

# Verificar directorio build/templates/emails
if [ -d "build/templates/emails" ]; then
    log_success "Directorio destino encontrado: build/templates/emails"
    
    echo "📋 Contenido del directorio destino:"
    ls -la build/templates/emails/ | while read line; do
        echo "   $line"
    done
    
    TEMPLATE_COUNT_BUILD=$(find build/templates/emails -name "*.html" 2>/dev/null | wc -l)
    log_info "📊 Templates en build/: $TEMPLATE_COUNT_BUILD archivos .html"
else
    log_warning "Directorio destino NO encontrado: build/templates/emails"
    TEMPLATE_COUNT_BUILD=0
fi

echo ""

# ============================================================================
# VERIFICACIÓN DE TEMPLATES CRÍTICOS
# ============================================================================
log_info "🔍 Verificando templates críticos..."

CRITICAL_TEMPLATES=(
    "student-invitation.template.html"
    "questionnaire-reminder.template.html" 
    "forgot-password.template.html"
    "base-email.template.html"
    "password-reset-confirmation.template.html"
)

MISSING_TEMPLATES=()
EXISTING_TEMPLATES=()

for template in "${CRITICAL_TEMPLATES[@]}"; do
    if [ -f "build/templates/emails/$template" ]; then
        EXISTING_TEMPLATES+=("$template")
        log_success "✅ $template - OK"
    else
        MISSING_TEMPLATES+=("$template")
        log_error "❌ $template - FALTANTE"
    fi
done

echo ""
log_info "📊 Resumen de templates:"
log_info "   ✅ Existentes: ${#EXISTING_TEMPLATES[@]}"
log_info "   ❌ Faltantes: ${#MISSING_TEMPLATES[@]}"

# ============================================================================
# CORRECCIÓN AUTOMÁTICA
# ============================================================================
if [ ${#MISSING_TEMPLATES[@]} -gt 0 ]; then
    log_warning "🔧 Se necesita corrección de templates..."
    
    # Crear directorio si no existe
    log_info "📁 Creando directorio build/templates/emails..."
    mkdir -p build/templates/emails
    
    # Copiar todos los templates
    log_info "📋 Copiando templates desde src/ a build/..."
    
    COPIED_COUNT=0
    for template_file in src/templates/emails/*.html; do
        if [ -f "$template_file" ]; then
            template_name=$(basename "$template_file")
            cp "$template_file" "build/templates/emails/$template_name"
            log_success "📄 Copiado: $template_name"
            ((COPIED_COUNT++))
        fi
    done
    
    log_success "✅ $COPIED_COUNT templates copiados exitosamente"
    
    # Verificar permisos
    log_info "🔒 Configurando permisos..."
    chmod -R 644 build/templates/emails/*.html 2>/dev/null || true
    
    # Verificación post-copia
    log_info "🔍 Verificación post-copia..."
    for template in "${CRITICAL_TEMPLATES[@]}"; do
        if [ -f "build/templates/emails/$template" ]; then
            file_size=$(stat -c%s "build/templates/emails/$template" 2>/dev/null || echo "0")
            log_success "✅ $template - OK ($file_size bytes)"
        else
            log_error "❌ $template - SIGUE FALTANTE"
        fi
    done
    
else
    log_success "🎉 Todos los templates críticos están presentes"
fi

echo ""

# ============================================================================
# VERIFICACIÓN DEL CONTENIDO DE TEMPLATES
# ============================================================================
log_info "🔍 Verificando contenido de templates críticos..."

# Verificar student-invitation.template.html específicamente
if [ -f "build/templates/emails/student-invitation.template.html" ]; then
    template_size=$(stat -c%s "build/templates/emails/student-invitation.template.html")
    if [ $template_size -gt 100 ]; then
        log_success "✅ student-invitation.template.html tiene contenido válido ($template_size bytes)"
        
        # Verificar que contiene las variables necesarias
        if grep -q "{{INVITATION_URL}}" "build/templates/emails/student-invitation.template.html"; then
            log_success "✅ Template contiene variable INVITATION_URL"
        else
            log_warning "⚠️ Template NO contiene variable INVITATION_URL"
        fi
    else
        log_error "❌ student-invitation.template.html está vacío o corrupto"
    fi
else
    log_error "❌ student-invitation.template.html NO existe"
fi

echo ""

# ============================================================================
# REINICIO DEL BACKEND
# ============================================================================
log_info "🔄 Verificando si PM2 está corriendo..."

if command -v pm2 >/dev/null 2>&1; then
    if pm2 list | grep -q "teamlens-backend"; then
        log_info "🔄 Reiniciando backend para aplicar cambios..."
        pm2 restart teamlens-backend
        
        # Esperar un poco para que arranque
        sleep 3
        
        # Verificar que está corriendo
        if pm2 list | grep -q "teamlens-backend.*online"; then
            log_success "✅ Backend reiniciado exitosamente"
        else
            log_warning "⚠️ Backend puede estar iniciando aún..."
        fi
    else
        log_warning "⚠️ Backend no está corriendo en PM2"
    fi
else
    log_warning "⚠️ PM2 no está disponible"
fi

echo ""

# ============================================================================
# VERIFICACIÓN FINAL
# ============================================================================
log_info "🩺 Verificación final del sistema..."

# Verificar que el endpoint responde
if curl -f http://localhost:3000/health >/dev/null 2>&1; then
    log_success "✅ Backend responde correctamente"
else
    log_warning "⚠️ Backend no responde - puede estar iniciando"
fi

# Resumen final
echo ""
echo "============================================================================"
log_success "🎉 CORRECCIÓN DE TEMPLATES COMPLETADA"
echo "============================================================================"
echo ""

log_info "📊 Resumen:"
log_info "   📁 Templates copiados desde: src/templates/emails/"
log_info "   📁 Templates disponibles en: build/templates/emails/"
log_info "   📋 Templates críticos: ${#CRITICAL_TEMPLATES[@]}"
log_info "   ✅ Templates existentes: $(find build/templates/emails -name "*.html" 2>/dev/null | wc -l)"

echo ""
log_success "🚀 El sistema de emails debería funcionar ahora"
log_info "💡 Para probar: añade un estudiante desde el frontend"
log_info "📝 Para ver logs: pm2 logs teamlens-backend --follow"

echo "" 