import express, { Request, Response } from "express";
import { collections } from "../services/database.service";

import User from "../models/user";
import bcrypt from "bcrypt";
import jwt, { SignOptions } from "jsonwebtoken";

import emailService from "../services/email.service";

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
        res.status(200).send(userWithoutPassword);

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
                $set: { name: newUser.name, role: 'student', password: newUser.password }
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

        let mailDetails = {
            from: "dalfamosni@gmail.com",
            to: user.email,
            subject: 'Reset password',
            text: `Please click on the following link to reset your password: http://localhost:4200/reset-password/${token}`
        }

        await emailService.sendEmail(mailDetails);

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

        let mailDetails = {
            to: user.email,
            subject: 'Reset password',
            text: `Your password has been reset successfully. Please login with your new password.`
        }

        await emailService.sendEmail(mailDetails);

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