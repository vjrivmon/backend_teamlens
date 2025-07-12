import cors from 'cors';

// Configuración dinámica de CORS basada en el entorno
const isProduction = process.env.NODE_ENV === 'production';
const productionOrigin = process.env.FRONTEND_URL || 'http://teamlens.gti-ia.dsic.upv.es';

const corsOptions = {
    origin: [
        "http://localhost:4200",  // Desarrollo
        "http://localhost:3000",  // Desarrollo alternativo
        productionOrigin,         // Producción
        "http://teamlens.gti-ia.dsic.upv.es"  // Producción explícita
    ],
    allowedHeaders: [
        'Content-Type', 
        'Authorization', 
        'X-Requested-With',
        'Accept',
        'Origin',
        'Cache-Control',
        'X-File-Name'
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    optionsSuccessStatus: 200
};

console.log(`🌐 [CORS] Configurando orígenes permitidos:`, corsOptions.origin);
console.log(`🌐 [CORS] Entorno: ${isProduction ? 'PRODUCCIÓN' : 'DESARROLLO'}`);

export default cors(corsOptions);
