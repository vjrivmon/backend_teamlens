import cookieSession from "cookie-session";

export default cookieSession({
    name: "dalfmos-session",
    keys: [process.env.COOKIE_SECRET as string],
    httpOnly: true,
    //maxAge: 24 * 60 * 60 * 1000, // 24 hours
})