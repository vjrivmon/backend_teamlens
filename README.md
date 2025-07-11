
# Teamlens. Backend repository.

This document provides an overview of the backend's project structure: key files, models, services, middlewares, routes, environment variables, scripts, and dependencies. The project is a Node.js application using TypeScript, Express, and MongoDB. It includes various models, routes, and services to manage users, activities, groups, and questionnaires.

## Project Structure
```
.env
.env-dev
.gitignore
package.json
src/
    functions/
        exceptions/
        group-functions.ts
        user-functions.ts
    index.ts
    middlewares/
        cookie-session.ts
        cors.ts
        headers.ts
        index.ts
        verify-token.ts
    models/
        activity.ts
        group.ts
        questionnaire.ts
        user.ts
    routes/
        activity.router.ts
        auth.router.ts
        groups.router.ts
        handle-activity-students.router.ts
        handle-group-students.router.ts
        questionnaires.router.ts
        user.router.ts
    scripts/
    services/
tsconfig.json
```

## Key Files and Their Roles

### Configuration Files
- **[`.env`]**: Environment variables for production.
- **[`.env-dev`]**: Environment variables for development.
- **[`package.json`]**: Project metadata and dependencies.

### Source Code
- **[`src/index.ts`]**: Entry point of the application.
- **[`src/controllers/`]**: Contains controller logic.
- **[`src/functions/`]**: Contains utility functions and exception handling.
- **[`src/middlewares/`]**: Middleware for session management, CORS, headers, and token verification.
- **[`src/models/`**: Defines data models for the application.
- **[`src/routes/`]**: Defines the API routes.
- **[`src/services/`]**: Contains services for database connection and other utilities.

## Environment Variables
Defined in [`.env-dev`]`
```
ENVIROMENT="development"
JWT_SECRET="jwt-secret-key"
JWT_ALGORITHM="HS256"
COOKIE_SECRET="cookie-secret-key"
MONGO_URI="mongodb://localhost:27017/"
DB_NAME="test"
EMAIL_PASSWORD="mail@mail.com" 
EMAIL_USER="1234"
```

## Scripts
Defined in [`package.json`]
```json
{
"scripts": {
        "dev": "ts-node-dev --env-file .env-dev src/index.ts",
        "start": "node --env-file .env build/index.js",
        "tsc": "tsc",
        "test": "echo \"Error: no test specified\" && exit 1"
    }
}
```

## Models

### User Model
Defined in [`src/models/user.ts`]:
```typescript
import { ObjectId } from "mongodb";

export default class User {
    constructor(
        public email: string,
        public name: string,
        public password: string,
        public role: string,
        public askedQuestionnaires?: AskedQuestionnaire[],
        public activities?: ObjectId[],
        public groups?: ObjectId[],
        public resetToken?: string,
        public invitationToken?: string,
        public notifications?: INotification[],
        public _id?: ObjectId
    ) { }
}

export interface AskedQuestionnaire {
    questionnaire: ObjectId;
    result: string;
}

export interface INotification {
    // Define notification properties here
}
```

### Activity Model
Defined in [`src/models/activity.ts`]:
```typescript
import { ObjectId } from "mongodb";

export default class Activity {
    constructor(
        public title: string,
        public description: string,
        public teacher: ObjectId,
        public students?: ObjectId[],
        public groups?: ObjectId[],
        public _id?: ObjectId
    ) { }
}
```

### Group Model
Defined in [`src/models/group.ts`]:
```typescript
import { ObjectId } from "mongodb";

export default class Group {
    constructor(
        public name: string,
        public students: ObjectId[],
        public activity: ObjectId,
        public _id?: ObjectId
    ) { }
}
```

### Questionnaire Model
Defined in [`src/models/questionnaire.ts`]:
```typescript
import { ObjectId } from "mongodb";

export default class Questionnaire {
    constructor(
        public title: string,
        public description: string,
        public questions: Question[],
        public questionnaireType: string,
        public _id?: ObjectId
    ) { }
}

export interface Question {
    question: string;
    type: QuestionType;
    options?: string[];
}

export enum QuestionType {
    MultipleChoice = "MultipleChoice",
    OpenText = "OpenText",
    Rating = "Rating"
}
```

## Services

### Database Service

The following code is a TypeScript module that facilitates the connection to a MongoDB database and sets up collections for various data models.

Defined in [`src/services/database.service.ts`]:
```typescript
import * as mongoDB from "mongodb";
import User from "../models/user";
import Activity from "../models/activity";
import Group from "../models/group";
import Questionnaire from "../models/questionnaire";

export const collections: { 
    users?: mongoDB.Collection<User>, 
    activities?: mongoDB.Collection<Activity>,
    groups?: mongoDB.Collection<Group>,
    questionnaires?: mongoDB.Collection<Questionnaire>
} = {}

export var client: mongoDB.MongoClient;

export async function connectToDatabase() {
    client = new mongoDB.MongoClient(process.env.MONGO_URI as string);
    await client.connect();
    const db: mongoDB.Db = client.db(process.env.DB_NAME);
    collections.users = db.collection<User>('users');
    collections.activities = db.collection<Activity>('activities');
    collections.groups = db.collection<Group>('groups');
    collections.questionnaires = db.collection<Questionnaire>('questionnaires');
    console.log(`MongoDB: Successfully connected to database: ${db.databaseName}`);
}
```
It begins by importing the necessary modules from the mongodb package and the data models (User, Activity, Group, and Questionnaire) from the project's model directory.

The collections object is defined to hold references to the MongoDB collections for users, activities, groups, and questionnaires. Initially, these properties are optional and undefined. The client variable is declared to store the MongoDB client instance.

The connectToDatabase function is an asynchronous function responsible for establishing a connection to the MongoDB database. It starts by creating a new MongoClient instance using the MongoDB URI stored in the environment variable MONGO_URI. The await client.connect() statement then establishes the connection to the database server.

Once connected, the function retrieves a reference to the database specified by the DB_NAME environment variable using client.db(). It then defines and initializes the collections for users, activities, groups, and questionnaires by calling db.collection() with the respective collection names. These collections are then assigned to the corresponding properties in the collections object.

This setup ensures that the application has access to the necessary collections for performing CRUD operations on the data models.

## Middlewares

Here is a detailed explanation of all the middlewares in the project:

### Cookie Session Middleware

**File:** [`src/middlewares/cookie-session.ts`]

This middleware is responsible for handling cookie-based sessions in your application. It uses the [`cookie-session`] library to create a session middleware with the following configuration:

- **name**: The name of the session cookie ([`dalfmos-session`].
- **keys**: An array of keys used to sign and verify the cookie. It uses the [`COOKIE_SECRET`] environment variable.
- **httpOnly**: Ensures the cookie is only accessible via HTTP(S) and not client-side JavaScript.

```ts
import cookieSession from "cookie-session";
export default cookieSession
({
    name: "dalfmos-session",
    keys: [process.env.COOKIE_SECRET as string],
    httpOnly: true,
    //maxAge: 24 * 60 * 60 * 1000, // 24 hours
})
```

### CORS Middleware

**File:** [`src/middlewares/cors.ts`]

This middleware handles Cross-Origin Resource Sharing (CORS) using the [`cors`] library. It allows your application to accept requests from different origins, which is essential for enabling communication between the frontend and backend hosted on different domains or ports.

- **origin**: Specifies the allowed origin ([`http://localhost:4200`].
- **allowedHeaders**: Specifies the allowed headers ([`Content-Type`], [`Authorization`].
- **credentials**: Indicates whether the request can include user credentials like cookies.

```ts
import cors from 'cors';
var corsOptions = {
    origin: "http://localhost:4200",
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
};
export default cors(corsOptions);
```

### Headers Middleware

**File:** [`src/middlewares/headers.ts`]

This middleware sets custom headers for responses. It adds the [`Access-Control-Allow-Headers`] header to allow specific headers in requests.

```ts
const setHeaders = (_req:any, res:any, next:any) => {
    res.header(
        "Access-Control-Allow-Headers",
        "Origin, Content-Type, Accept"
    );
    next();
}
export default setHeaders;
```

### Verify Token Middleware

**File:** [`src/middlewares/verify-token.ts`]

This middleware verifies JWT tokens to ensure that the user is authenticated before accessing protected routes. It uses the [`jsonwebtoken`] library to verify the token.

- **token**: Extracts the token from the session.
- **secret**: Uses the [`JWT_SECRET`] environment variable to verify the token.
- **req.session.authuser**: Sets the authenticated user's ID in the session.

If the token is missing or invalid, it sends a [`403`] or [`401`] status code, respectively.

```ts
import jwt from "jsonwebtoken";
const verifyToken = async (req:any, res:any, next:any) => {
    //const token = req.header('Authorization')?.replace('Bearer ', '');
    const token = req.session?.token;
    if (!token) {
        return res.status(403).send({ message: "No token provided!" });
    }
    const secret = process.env.JWT_SECRET as string;
    jwt.verify(token, secret, (errors: any, decoded: any) => {
        if (errors) {
            return res.status(401).send({ message: "Unauthorized!" });
        }
        req.session.authuser = decoded.id;
        return next();
    });
    return;
}
export default verifyToken;
```

### Middleware Index

**File:** [`src/middlewares/index.ts`]

This file exports all the middlewares for easy import into other parts of the application.

```ts
import cookieSessionMiddleware from "./cookie-session";
import corsMiddleware from "./cors";
import headersMiddleware from "./headers";
import verifyToken from "./verify-token";
export {
    cookieSessionMiddleware,
    corsMiddleware,
    headersMiddleware,
    verifyToken
}
```

### Usage in Main Application

**File:** [`src/index.ts`]

In the main application file, these middlewares are imported and used with the Express app.

```ts
import express from 'express';
import { cookieSessionMiddleware, corsMiddleware, headersMiddleware, verifyToken as _vt, verifyToken } from './middlewares'
import { connectToDatabase } from "./services/database.service"
import { usersRouter } from "./routes/user.router";
import { activitiesRouter } from "./routes/activity.router";
import { questionnairesRouter } from './routes/questionnaires.router';
import { authRouter } from './routes/auth.router';

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(cookieSessionMiddleware)
app.use(corsMiddleware)
app.use(headersMiddleware);

app.get('/health', (_req, res) => {
    res.send(process.env.ENVIROMENT);
});

//Check if database connection is successful before start the server
connectToDatabase()
    .then(() => {
        
        app.use("/users", verifyToken, usersRouter);
        app.use("/activities", verifyToken, activitiesRouter);
        app.use("/questionnaires", verifyToken, questionnairesRouter);
        app.use("/auth", authRouter);

        app.listen(PORT, () => {
            console.log(`Server started at http://localhost:${PORT}`);
        });
    })
    .catch((error: Error) => {
        console.error("Database connection failed", error);
        process.exit();
    });
```

## Algorithm Request Worker

This script is designed to run within a worker thread in Node.js. It executes a Python script with data passed from the main thread, making it suitable for computational tasks such as student/user team pairing algorithms.

#### Modules and Dependencies

- **[`worker_threads`]**: Provides the [`parentPort`] and [`workerData`] objects for communication between the worker thread and the parent thread.
- **[`child_process`]**: Provides the [`exec`] function to execute shell commands from within Node.js.
- **[`path`]**: Provides utilities for handling and manipulating file paths.

```javascript
const { parentPort, workerData } = require('worker_threads');
const { exec } = require('child_process');
const path = require('path');

const jsonString = JSON.stringify(workerData.algorithmData).replace(/"/g, '\\"');
const scriptPath = path.join(__dirname, 'algorithm.py');
const command = `py "${scriptPath}" ${jsonString}`;
console.log(`Comando a ejecutar: ${command}`);

//Ejectuar comando y esperar la respuesta
exec(command, (error, stdout, stderr) => {
    if (error) {
        console.error(`Error ejecutando el script: ${error.message}`);
        return;
    }
    if (stderr) {
        console.error(`Error en el script: ${stderr}`);
        return;
    }
    parentPort.postMessage(stdout);
});
```

#### Code Explanation

1. **Import Required Modules:**
   ```javascript
   const { parentPort, workerData } = require('worker_threads');
   const { exec } = require('child_process');
   const path = require('path');
   ```

2. **Prepare Data for the Python Script:**
   - Convert the [`algorithmData`] from [`workerData`] into a JSON string.
   - Escape double quotes in the JSON string to ensure it can be safely passed as a command-line argument.
   ```javascript
   const jsonString = JSON.stringify(workerData.algorithmData).replace(/"/g, '\\"');
   ```

3. **Construct the Command:**
   - Define the path to the Python script ([`algorithm.py`]).
   - Construct the command to run the Python script with the JSON string as an argument.
   ```javascript
   const scriptPath = path.join(__dirname, 'algorithm.py');
   const command = `py "${scriptPath}" ${jsonString}`;
   ```

4. **Execute the Command:**
   - Use the [`exec`] function to run the constructed command.
   - Handle the command's output and errors.
   - Send the result back to the parent thread using [`parentPort.postMessage`].
   ```javascript
   exec(command, (error, stdout, stderr) => {
       if (error) {
           console.error(`Error ejecutando el script: ${error.message}`);
           return;
       }
       if (stderr) {
           console.error(`Error en el script: ${stderr}`);
           return;
       }
       parentPort.postMessage(stdout);
   });
   ```
