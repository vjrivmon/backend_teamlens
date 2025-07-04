import { Request, Response, NextFunction } from "express";
import { collections } from "../services/database.service";
import { ObjectId } from "mongodb";

/**
 * Middleware para verificar que el usuario autenticado tiene rol de "teacher"
 * Debe ejecutarse después del middleware verifyToken
 * @param req Request con session.authuser establecido
 * @param res Response object
 * @param next Next function
 */
const verifyTeacher = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const authUserId = (req.session as any)?.authuser;
        
        if (!authUserId) {
            return res.status(401).send({ 
                message: "No authenticated user found" 
            });
        }

        // Buscar el usuario en la base de datos
        const user = await collections.users?.findOne({ 
            _id: new ObjectId(authUserId) 
        });

        if (!user) {
            return res.status(401).send({ 
                message: "User not found" 
            });
        }

        // Verificar que el usuario tiene rol de teacher
        if (user.role !== 'teacher') {
            return res.status(403).send({ 
                message: "Access denied. Teacher role required." 
            });
        }

        // Si es teacher, continuar
        return next();
        
    } catch (error: any) {
        console.error('Error in verifyTeacher middleware:', error);
        return res.status(500).send({ 
            message: "Internal server error during authorization" 
        });
    }
};

export default verifyTeacher; 