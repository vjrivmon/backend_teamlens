import nodemailer from "nodemailer";
import Mail from "nodemailer/lib/mailer";

const sendEmail = async (mailDetails: Mail.Options) => {

    
    const mailTransporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASSWORD
        }
    });

    mailDetails.from = process.env.EMAIL_USER
    
    await mailTransporter.sendMail(mailDetails);

    
}
export default { sendEmail };