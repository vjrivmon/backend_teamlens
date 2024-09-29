import nodemailer from "nodemailer";
import Mail from "nodemailer/lib/mailer";

const sendEmail = async (mailDetails: Mail.Options) => {

    // console.log(process.env.EMAIL_USER);
    // console.log(process.env.EMAIL_PASS);
    
    const mailTransporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: {
            // user: "dalfamosni@gmail.com",
            // pass: "ggkt kzvd fsqw vdkd"
            user: "teamlens.app@gmail.com",
            pass: "wobx oabi gxiw nlco"
        },
    });

    mailDetails.from = "teamlens.app@gmail.com"
    
    await mailTransporter.sendMail(mailDetails);

    
}
export default { sendEmail };