import usermodel from "../models/user.model.js"
import sessionModel from "../models/session.model.js";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import config from "../config/config.js";

export async function register(req, res) {
    const {username, email, password} = req.body;

    const isAlreadyRegisted = await usermodel.findOne({
        $or : [
            {username},
            {email}
        ]
    })

    if(isAlreadyRegisted){
        return res.status(409).json({
            message : "Username or Email already Exist"
        })
    }

    const hashedPassword = crypto.createHash("sha256").update(password).digest("hex");

    const user = await usermodel.create({
        username,
        email,
        password : hashedPassword
    })

    // const AccessToken = jwt.sign({id : user._id}, config.JWT_SECRET,{ expiresIn : "10m"})
    const refreshToken = jwt.sign({id : user._id}, config.JWT_SECRET,{ expiresIn : "1d"})

    const refreshTokenHash = crypto.createHash("sha256").update(refreshToken).digest("hex");

    const session = await sessionModel.create({
        user : user._id,
        refreshTokenHash,
        ip : req.ip,
        userAgent : req.headers["user-agent"],
    });

    const AccessToken = jwt.sign({id : user._id, sessionId : session._id}, config.JWT_SECRET, { expiresIn : "10m"}) //adding the session id , so we can reference the token through sessionId.

    res.cookie("refreshToken", refreshToken, {
        httpOnly: true,      // client-side JS cannot read this cookie
        secure: true,        // only sent over HTTPS
        sameSite: "strict",  // CSRF protection
        maxAge: 1 * 24 * 60 * 60 * 1000, 
    });

    res.status(201).json({
        message : "User Registerd",
        user: {
            username : user.username,
            email : user.email,
        },
        AccessToken
    })
}

export async function getme(req, res) {
    try{
    const AccessToken = req.headers.authorization?.split(" ")[1];

    if(!AccessToken){
        return res.status(401).json(
            {
                message : "AccessToken not present"
            }
        )
    }

    // const decode = jwt.verify(AccessToken, config.JWT_SECRET);
    const {id, iat, exp} = jwt.verify(AccessToken, config.JWT_SECRET);

    const user = await usermodel.findById(id);

    if(!user) return res.status(404).json({ message : "user not found"});

    return res.status(200).json({
        username : user.username,
        email : user.email,
        message : "User Details Fetched" 
    });
    }
    catch(err){
        return res.status(401).json({ message : "invalid or expired AccessToken", error: err.message});
}} 

export async function refreshToken(req, res) {
    try {
        const refreshToken = req.cookies.refreshToken;

        if (!refreshToken) {
            return res.status(401).json({ message: "Unauthorized access" });
        }

        const refreshTokenHash = crypto.createHash("sha256").update(refreshToken).digest("hex");

        const session = await sessionModel.findOne({
            refreshTokenHash, 
            revoked : false, // find session which is not expired
        })

        if(!session) return res.status(401).json({message : "Invalid Refresh Toekn"});

        const { id } = jwt.verify(refreshToken, config.JWT_SECRET);

        const AccessToken = jwt.sign({ id }, config.JWT_SECRET, { expiresIn: "10m" });

        return res.status(200).json({
            message: "AccessToken Created",
            AccessToken,
        });
    } catch (err) {
        return res.status(401).json({ message: "invalid or expired refresh token", error: err.message });
    }
}

export async function logout(req,res) {
    try {
        const refreshToken = req.cookies.refreshToken;
        if(!refreshToken) return res.status(400).json({message : "refresh token not found in cookie"});

        const refreshTokenHash = crypto.createHash("sha256").update(refreshToken).digest("hex");

        const session = await sessionModel.findOne({
            refreshTokenHash,
            revoked : false,
        });

        if(!session) return res.status(400).json({message : "No session Present"});

        session.revoked = true;
        await session.save();

        res.clearCookie("refreshToken");

        return res.status(200).json({message : "user logged out"});
    } catch (err) {
        return res.status(500).json({ message : "Something went wrong", error: err.message });
    }
}