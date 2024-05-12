import cors from 'cors';

var corsOptions = {
    origin: "*", //  http://localhost:4200
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
};

export default cors(corsOptions);
