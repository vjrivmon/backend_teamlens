import express from 'express';
import { createServer } from 'http';

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