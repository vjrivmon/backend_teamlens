import express from 'express';

import { cookieSessionMiddleware, corsMiddleware, headersMiddleware } from './middlewares'

import { connectToDatabase } from "./services/database.service"
import { usersRouter } from "./routes/user.router";
import { activitiesRouter } from "./routes/activity.router";
import { questionnairesRouter } from './routes/questionnaires.router';

const app = express();
const PORT = 3000;


app.use(express.json());
app.use(cookieSessionMiddleware)
app.use(corsMiddleware)
app.use(headersMiddleware);

app.get('/health', (_req, res) => {
    res.send(process.env.ENVIROMENT);
});

//TODO: check if environment variables exist before start the server

//Check if database connection is successful before start the server
connectToDatabase()
    .then(() => {
        
        app.use("/users", usersRouter);
        app.use("/activities", activitiesRouter);
        app.use("/questionnaires", questionnairesRouter);

        app.listen(PORT, () => {
            console.log(`Server started at http://localhost:${PORT}`);
        });
    })
    .catch((error: Error) => {
        console.error("Database connection failed", error);
        process.exit();
    });