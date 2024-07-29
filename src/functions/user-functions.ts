import { ObjectId } from "mongodb";
import User, { INotification } from "../models/user";
import { collections } from "../services/database.service";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import emailService from "../services/email.service";


export const createNonRegisteredAccount = async (email: string): Promise<ObjectId | undefined> => {

    // se crea una cuenta temporal con su email    
    const user = await collections.users?.findOne({ email: email });

    if (user) {
        throw new Error("User already exists");
    }

    const name = email.split('@')[0];
    const password = 'temporal_password';

    // cypher password
    const salt = await bcrypt.genSalt(10);
    const pass = await bcrypt.hash(password, salt);

    const newUser: User = {
        email: email,
        name: name,
        password: pass,
        role: "student"
    }

    // se crea un token temporal para que pueda completar su registro con el email para que solo sirva con ese correo
    newUser.invitationToken = jwt.sign({ email: email }, process.env.JWT_SECRET ?? "secret")

    const result = await collections.users?.insertOne(newUser);

    // se le envia un correo para que se registre
    let mailDetails = {
        to: email,
        subject: 'Has sido invitado a TeamLens',
        text: `Para completar su registro en la plataforma haga click en el siguiente enlace: http://localhost:4200/register/${newUser.invitationToken}`
    }

    await emailService.sendEmail(mailDetails);

    // se devuelve el usuario creado para añadirlo a la actividad
    return result?.insertedId;

}

export const addUserNotification = async (userId: ObjectId, notification: INotification) => {

    const user = await collections.users?.findOne({ _id: userId });

    if (!user) {
        throw new Error("User not found");
    }

    notification.date = new Date().toLocaleDateString();

    await collections.users?.updateOne({ _id: userId }, { $push: { notifications: notification } });

}