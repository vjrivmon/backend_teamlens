const setHeaders = (_req:any, res:any, next:any) => {
    res.header(
        "Access-Control-Allow-Headers",
        "Origin, Content-Type, Accept"
    );
    next();
}

export default setHeaders;