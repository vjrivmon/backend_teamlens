import express, { Request, Response } from "express";
import { collections } from "../services/database.service";

import User from "../models/user";
import bcrypt from "bcrypt";
import jwt, { SignOptions } from "jsonwebtoken";

import emailService from "../services/email.service";
import { ObjectId } from "mongodb";

export const authRouter = express.Router();


authRouter.post("/login", async (req: Request, res: Response) => {

    try {

        const user = await collections.users?.findOne({ email: req.body.email });

        if (!user) {
            res.status(401).send("(e)Invalid credentials.");
            return
        }

        const isPasswordValid = await bcrypt.compare(req.body.password, user.password);

        if (user.invitationToken || !isPasswordValid) {
            res.status(401).send("(p)Invalid credentials.");
            return
        }

        const secret = process.env.JWT_SECRET ?? "secret";

        const token = jwt.sign({ id: user._id }, secret,
            {
                algorithm: process.env.JWT_ALGORITHM ?? "HS256",
                allowInsecureKeySizes: true,
                expiresIn: "24h",
            } as SignOptions);

        (req.session as any).token = token;

        const { password, ...userWithoutPassword } = user;
        // Incluir el token JWT en la respuesta para WebSocket
        res.status(200).send({ ...userWithoutPassword, token });

    } catch (error: any) {
        console.error(error);
        res.status(400).send(error.message);
    }
});

authRouter.post("/register", async (req: Request, res: Response) => {
    try {

        const newUser = req.body as User;

        const user = await collections.users?.findOne({ email: newUser?.email });

        if (user) {
            res.status(409).send("User already exists.");
            return
        }

        const userRole = newUser.role ? newUser.role : 'teacher';
        newUser.role = userRole;

        // cypher password
        const salt = await bcrypt.genSalt(10);
        newUser.password = await bcrypt.hash(newUser.password, salt);

        console.log(newUser);

        const result = await collections.users?.insertOne(newUser);

        result
            ? res.status(200).send({
                message: `Successfully created a new user with id ${result.insertedId}`
            })
            : res.status(500).send({
                message: "Failed to create a new user."
            });
    } catch (error: any) {
        console.error(error);
        res.status(400).send({
            message: error.message
        });
    }
});


authRouter.post("/register-student", async (req: Request, res: Response) => {

    try {

        const newUser = req.body as User;

        const user = await collections.users?.findOne({ email: newUser?.email });

        if (!user) {
            res.status(409).send("User not invited.");
            return
        }

        if (user && !user?.invitationToken) {
            res.status(409).send("User already exists.");
            return
        }

        const tokenValid = jwt.verify(user!.invitationToken!, process.env.JWT_SECRET ?? "secret");

        if (!tokenValid) {
            res.status(401).send("Invalid token.");
            return
        }
        
        // cypher password
        const salt = await bcrypt.genSalt(10);
        newUser.password = await bcrypt.hash(newUser.password, salt);

        await collections.users?.updateOne({ email: newUser.email },
            {
                $unset: { invitationToken: 1 },
                $set: { name: newUser.name, gender: newUser.gender, role: 'student', password: newUser.password }
            });


        res.status(200).send({
            message: `Successfully registred user with email ${newUser.email}`
        })
    } catch (error: any) {
        console.error(error);
        res.status(400).send({
            message: error.message
        });
    }

});

authRouter.post("/forgot-password", async (req: Request, res: Response) => {
    try {

        const user = await collections.users?.findOne({ email: req.body.email });

        if (!user) {
            res.status(404).send("User not found.");
            return
        }

        const payload = {
            email: user.email
        }
        const token = jwt.sign(payload, process.env.JWT_SECRET ?? "defaultSecret", {
            expiresIn: "5m"
        });

        await collections.users?.updateOne({ email: user.email }, { $set: { resetToken: token } });

        // Usar el nuevo método profesional de recuperación de contraseña
        await emailService.sendForgotPassword(user.email, token);

        res.status(200).send({
            message: 'Email sent successfully'
        });

    } catch (error: any) {
        console.error(error);
        res.status(400).send({
            message: error.message
        });
    }

});

authRouter.post("/reset-password", async (req: Request, res: Response) => {
    try {

        const { token, password } = req.body;

        const user = await collections.users?.findOne({ resetToken: token });

        if (!user) {
            res.status(404).send("User not found.");
            return
        }

        const { exp } = jwt.decode(token);

        if (Date.now() >= exp * 1000) {
            res.status(401).send("Invalid token.");
            return;
        }

        // cypher password
        const salt = await bcrypt.genSalt(10);
        const cpass = await bcrypt.hash(password, salt);

        const result = await collections.users?.updateOne({ _id: user._id }, { $unset: { resetToken: 1 }, $set: { password: cpass } });

        if (result?.modifiedCount === 0) {
            res.status(500).send("Failed to reset password.");
            return
        }

        // Usar el nuevo método profesional de confirmación de reset de contraseña
        await emailService.sendPasswordResetConfirmation(user.email);

        res.status(200).send({
            message: 'Email sent successfully'
        });



    } catch (error: any) {
        console.error(error);
        res.status(400).send({
            message: error.message
        });
    }

});

/**
 * ENDPOINT TEMPORAL: Cambiar rol del usuario actual a teacher
 * @route PATCH /auth/promote-to-teacher
 * @desc Cambia el rol del usuario autenticado a 'teacher'
 */
authRouter.patch("/promote-to-teacher", async (req: Request, res: Response) => {
    try {
        const authUserId = (req.session as any)?.authuser;
        
        console.log(`🔧 [PromoteTeacher] Promoviendo usuario a teacher: ${authUserId}`);
        
        if (!authUserId) {
            return res.status(401).send({
                message: "No authenticated user found"
            });
        }

        // Buscar y actualizar el usuario
        const result = await collections.users?.updateOne(
            { _id: new ObjectId(authUserId) },
            { 
                $set: { 
                    role: 'teacher',
                    updatedAt: new Date()
                } 
            }
        );

        if (!result || result.matchedCount === 0) {
            return res.status(404).send({
                message: "User not found"
            });
        }

        // Obtener el usuario actualizado
        const updatedUser = await collections.users?.findOne({ 
            _id: new ObjectId(authUserId) 
        });

        console.log(`✅ [PromoteTeacher] Usuario promovido exitosamente:`, {
            id: updatedUser?._id,
            email: updatedUser?.email,
            name: updatedUser?.name,
            role: updatedUser?.role
        });

        return res.status(200).send({
            message: "User role updated to teacher successfully",
            user: {
                id: updatedUser?._id,
                email: updatedUser?.email,
                name: updatedUser?.name,
                role: updatedUser?.role
            }
        });

    } catch (error: any) {
        console.error('💥 [PromoteTeacher] Error promoting user to teacher:', error);
        return res.status(500).send({
            message: "Internal server error updating user role"
        });
    }
});

/**
 * 🔧 ENDPOINT TEMPORAL DE DIAGNÓSTICO DE EMAILS
 * Este endpoint permite probar el sistema de envío de emails en tiempo real
 * Para detectar problemas con SMTP, templates o configuración
 * 
 * @route POST /auth/debug-email
 * @body { email: string, type: 'invitation' | 'test' }
 * @returns Estado detallado del envío de email
 */
authRouter.post("/debug-email", async (req: Request, res: Response): Promise<void> => {
    try {
        console.log(`🔧 [Auth Debug] Iniciando test de envío de email...`);
        
        const { email, type = 'test' } = req.body;
        
        if (!email || !email.includes('@')) {
            res.status(400).send({
                success: false,
                error: 'Email válido es requerido',
                example: { email: 'test@example.com', type: 'invitation' }
            });
            return;
        }

        console.log(`📧 [Auth Debug] Probando envío a: ${email}, tipo: ${type}`);
        
        // Verificar configuración de email service
        const emailConfig = {
            user: process.env.EMAIL_USER,
            password: process.env.EMAIL_PASSWORD ? '[CONFIGURADA]' : '[NO CONFIGURADA]',
            frontendUrl: process.env.FRONTEND_URL,
            nodeEnv: process.env.NODE_ENV
        };
        
        console.log(`⚙️ [Auth Debug] Configuración actual:`, emailConfig);
        
        let emailResult;
        
        if (type === 'invitation') {
            // Simular envío de invitación completa
            console.log(`🎓 [Auth Debug] Simulando invitación de estudiante...`);
            
            // Generar token temporal para la prueba
            const testToken = jwt.sign(
                { email: email, type: 'invitation', debug: true },
                process.env.JWT_SECRET ?? "secret",
                { expiresIn: '1h' }
            );
            
            emailResult = await emailService.sendStudentInvitation(email, testToken);
            
        } else {
            // Envío de email de prueba básico
            console.log(`🧪 [Auth Debug] Enviando email de prueba básico...`);
            
            emailResult = await emailService.sendEmail({
                to: email,
                subject: '🧪 Test de TeamLens - Sistema de Emails',
                html: `
                    <h2>✅ Test de Email Exitoso</h2>
                    <p>Si recibes este email, el sistema de TeamLens está funcionando correctamente.</p>
                    <p><strong>Fecha:</strong> ${new Date().toLocaleString()}</p>
                    <p><strong>Servidor:</strong> ${process.env.NODE_ENV || 'desarrollo'}</p>
                    <p><strong>Frontend URL:</strong> ${process.env.FRONTEND_URL}</p>
                    <hr>
                    <p style="color: #666; font-size: 12px;">
                        Este es un email de prueba del sistema TeamLens. 
                        Si no esperabas este mensaje, puedes ignorarlo.
                    </p>
                `,
                text: `Test de TeamLens - Sistema funcionando correctamente en ${new Date().toLocaleString()}`
            });
        }
        
        console.log(`📊 [Auth Debug] Resultado del envío:`, emailResult);
        
        // Respuesta detallada para debugging
        const response = {
            success: emailResult.success,
            messageId: emailResult.messageId,
            timestamp: new Date().toISOString(),
            config: emailConfig,
            emailDetails: {
                to: email,
                type: type,
                frontendUrl: process.env.FRONTEND_URL
            },
            ...(emailResult.error && { error: emailResult.error }),
            ...(emailResult.debugInfo && { debugInfo: emailResult.debugInfo }),
            recommendations: []
        };
        
        // Agregar recomendaciones basadas en el resultado
        if (!emailResult.success) {
            response.recommendations.push('Verificar configuración EMAIL_PASSWORD en .env.production');
            response.recommendations.push('Revisar logs del servidor para errores SMTP');
            if (emailResult.error?.includes('authentication') || emailResult.error?.includes('login')) {
                response.recommendations.push('Verificar credenciales de Gmail y App Password');
            }
        } else {
            response.recommendations.push('Email enviado exitosamente - revisar carpeta de spam del destinatario');
            response.recommendations.push('Para invitaciones reales, usar: POST /activities/{id}/students');
        }
        
        res.status(emailResult.success ? 200 : 500).send(response);
        
    } catch (error: any) {
        console.error(`❌ [Auth Debug] Error en test de email:`, error);
        
        res.status(500).send({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString(),
            recommendations: [
                'Verificar que el servidor de email esté configurado correctamente',
                'Revisar variables de entorno EMAIL_USER y EMAIL_PASSWORD',
                'Verificar conectividad a smtp.gmail.com puerto 465'
            ]
        });
    }
});

export default authRouter;