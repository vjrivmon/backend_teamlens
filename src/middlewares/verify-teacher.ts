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
        
        console.log(`🔍 [VerifyTeacher] Verificando permisos de teacher...`);
        console.log(`🔍 [VerifyTeacher] AuthUserId de sesión: ${authUserId}`);
        
        if (!authUserId) {
            console.log(`❌ [VerifyTeacher] No hay usuario autenticado en la sesión`);
            return res.status(401).send({ 
                message: "No authenticated user found" 
            });
        }

        // Buscar el usuario en la base de datos
        const user = await collections.users?.findOne({ 
            _id: new ObjectId(authUserId) 
        });

        console.log(`🔍 [VerifyTeacher] Usuario encontrado:`, {
            id: user?._id,
            email: user?.email,
            name: user?.name,
            role: user?.role
        });

        if (!user) {
            console.log(`❌ [VerifyTeacher] Usuario ${authUserId} no encontrado en la base de datos`);
            return res.status(401).send({ 
                message: "User not found" 
            });
        }

        // Verificar que el usuario tiene rol de teacher
        if (user.role !== 'teacher') {
            console.log(`❌ [VerifyTeacher] Usuario ${user.email} tiene rol '${user.role}', se requiere 'teacher'`);
            return res.status(403).send({ 
                message: `Access denied. Teacher role required. Current role: ${user.role}`,
                userRole: user.role,
                requiredRole: 'teacher',
                userInfo: {
                    id: user._id,
                    email: user.email,
                    name: user.name
                }
            });
        }

        console.log(`✅ [VerifyTeacher] Usuario ${user.email} verificado como teacher`);
        // Si es teacher, continuar
        return next();
        
    } catch (error: any) {
        console.error('💥 [VerifyTeacher] Error in verifyTeacher middleware:', error);
        return res.status(500).send({ 
            message: "Internal server error during authorization" 
        });
    }
};

export default verifyTeacher; 