import express from 'express';
import { createServer } from 'http';
import path from 'path';

import { cookieSessionMiddleware, corsMiddleware, headersMiddleware, verifyToken as _vt, verifyToken } from './middlewares'

import { connectToDatabase } from "./services/database.service"
import { webSocketService } from './services/websocket.service';
import { usersRouter } from "./routes/user.router";
import { activitiesRouter } from "./routes/activity.router";
import { questionnairesRouter } from './routes/questionnaires.router';
import { authRouter } from './routes/auth.router';
import { debugRouter } from './routes/debug.router';

const app = express();
const server = createServer(app);
const PORT = 3000;


app.use(express.json());
app.use(cookieSessionMiddleware)
app.use(corsMiddleware)
app.use(headersMiddleware);

// ============================================================================
// ENDPOINT DE HEALTH CHECK EMPRESARIAL
// ============================================================================
app.get('/health', (_req, res) => {
    const healthInfo = {
        status: 'healthy',
        environment: process.env.ENVIROMENT || process.env.NODE_ENV || 'unknown',
        timestamp: new Date().toISOString(),
        config: {
            frontend_url: process.env.FRONTEND_URL || 'not_configured',
            port: process.env.PORT || '3000',
            node_env: process.env.NODE_ENV || 'unknown'
        },
        version: '2.0.0'
    };
    
    res.status(200).json(healthInfo);
});

// Endpoint legacy (mantener compatibilidad)
app.get('/api/health', (_req, res) => {
    res.status(200).json({ 
        status: 'healthy', 
        environment: process.env.ENVIROMENT || process.env.NODE_ENV 
    });
});

//TODO: check if environment variables exist before start the server

//Check if database connection is successful before start the server
connectToDatabase()
    .then(() => {
        
        // 🌐 Inicializar WebSocket Service
        console.log('🚀 [TeamLens] Inicializando servicios enterprise...');
        webSocketService.initialize(server);
        
        // Router sin autenticación para debug (SOLO DESARROLLO)
        app.use("/debug", debugRouter);
        
        // Routers con autenticación
        app.use("/users", verifyToken, usersRouter);
        app.use("/activities", verifyToken, activitiesRouter);
        app.use("/questionnaires", verifyToken, questionnairesRouter);
        app.use("/auth", authRouter);

        // ============================================================================
        // CONFIGURACIÓN EMPRESARIAL PARA SPA (SINGLE PAGE APPLICATION)
        // ============================================================================
        
        // 🚀 ACTIVAR SPA FALLBACK SIEMPRE (solución al problema de pantalla negra)
        const shouldEnableSPA = true; // Anteriormente: process.env.NODE_ENV === 'production'
        
        if (shouldEnableSPA) {
            // 📁 Servir archivos estáticos de Angular
            // El script deploy crea ./frontend_build desde el root del proyecto
            // __dirname es /home/gti/teamlens/backend_teamlens/build
            // Necesitamos ir a /home/gti/teamlens/frontend_build
            let angularDistPath = path.join(__dirname, '../../frontend_build');
            
            console.log(`🎯 [SPA] Sirviendo archivos estáticos desde: ${angularDistPath}`);
            
            // Verificar que el directorio existe
            try {
                const fs = require('fs');
                if (!fs.existsSync(angularDistPath)) {
                    console.log(`⚠️ [SPA] Directorio no encontrado: ${angularDistPath}`);
                    console.log(`🔍 [SPA] __dirname actual: ${__dirname}`);
                    console.log(`🔍 [SPA] Path calculado: ${angularDistPath}`);
                    
                    // Intentar paths alternativos
                    const alternativePaths = [
                        path.join(__dirname, '../frontend_build'),
                        path.join(__dirname, '../../../frontend_build'),
                        '/home/gti/teamlens/frontend_build'
                    ];
                    
                    let foundPath = null;
                    for (const altPath of alternativePaths) {
                        if (fs.existsSync(altPath)) {
                            console.log(`✅ [SPA] Directorio encontrado en path alternativo: ${altPath}`);
                            foundPath = altPath;
                            break;
                        } else {
                            console.log(`❌ [SPA] Path alternativo no existe: ${altPath}`);
                        }
                    }
                    
                    if (!foundPath) {
                        console.log(`⚠️ [SPA] SPA fallback desactivado - frontend no disponible`);
                        console.log(`🚧 [SPA] Funcionando solo con Nginx proxy`);
                        return;
                    } else {
                        // Usar el path encontrado
                        angularDistPath = foundPath;
                        console.log(`🔄 [SPA] Usando path corregido: ${angularDistPath}`);
                        
                        app.use(express.static(angularDistPath, {
                            maxAge: '1h',
                            etag: true,
                            lastModified: true,
                            index: false
                        }));
                    }
                } else {
                    console.log(`✅ [SPA] Directorio frontend encontrado: ${angularDistPath}`);
                    
                    app.use(express.static(angularDistPath, {
                        maxAge: '1h', // Cache de 1 hora para assets
                        etag: true,
                        lastModified: true,
                        index: false // No servir index.html automáticamente
                    }));
                }
            } catch (error) {
                console.error(`❌ [SPA] Error verificando directorio:`, error);
                return;
            }
            
            // ⚡ Fallback para rutas SPA - Enviar index.html para rutas no-API
            app.get('*', (req, res, next) => {
                console.log(`🔍 [SPA] Evaluando ruta: ${req.path}`);
                console.log(`🔍 [SPA] Headers: Accept=${req.headers.accept}`);
                
                // ✅ LÓGICA CORREGIDA: Solo pasar a API las rutas específicas, no todas las que empiecen con /activities/
                const isApiRoute = 
                    req.path.startsWith('/api/') || 
                    req.path.startsWith('/users/') || 
                    req.path.startsWith('/questionnaires/') || 
                    req.path.startsWith('/auth/') || 
                    req.path.startsWith('/debug/') ||
                    req.path.startsWith('/health') ||
                    // Solo estas rutas específicas de activities son API
                    req.path === '/activities' ||
                    (req.path.startsWith('/activities/') && req.method !== 'GET') ||
                    req.path.startsWith('/activities/api/');
                
                if (isApiRoute) {
                    console.log(`🔄 [SPA] Ruta API detectada: ${req.path} - pasando a siguiente middleware`);
                    return next();
                }
                
                // Para rutas del frontend (incluyendo /activities/ID), servir index.html
                const indexPath = path.join(angularDistPath, 'index.html');
                console.log(`🔄 [SPA] Sirviendo index.html para ruta: ${req.path}`);
                console.log(`🔄 [SPA] Path completo: ${indexPath}`);
                
                res.sendFile(indexPath, (err) => {
                    if (err) {
                        console.error(`❌ [SPA] Error sirviendo index.html:`, err);
                        console.error(`❌ [SPA] Path intentado: ${indexPath}`);
                        res.status(500).json({ 
                            error: 'Error interno del servidor',
                            message: 'No se pudo cargar la aplicación',
                            debug: {
                                path: indexPath,
                                originalUrl: req.originalUrl,
                                method: req.method
                            }
                        });
                    } else {
                        console.log(`✅ [SPA] index.html servido exitosamente para ${req.path}`);
                    }
                });
            });
            
            console.log(`✅ [SPA] Configuración SPA activada - Sirviendo Angular desde Express`);
        } else {
            console.log(`🚧 [SPA] SPA fallback desactivado`);
        }

        server.listen(PORT, () => {
            console.log(`🚀 [TeamLens] Servidor iniciado en http://localhost:${PORT}`);
            console.log(`🌐 [WebSocket] Sistema de comunicación tiempo real activo`);
            console.log(`📊 [Status] Servicios enterprise listos para producción`);
        });
    })
    .catch((error: Error) => {
        console.error("❌ [Database] Conexión fallida:", error);
        process.exit();
    });