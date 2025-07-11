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