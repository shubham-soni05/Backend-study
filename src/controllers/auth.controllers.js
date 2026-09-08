import usermodel from "../models/user.model.js"
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
        res.status(409).json({
            message : "Username or Email already Exist"
        })
    }

    const hashedPassword = crypto.createHash("sha256").update(password).digest("hex");

    const user = await usermodel.create({
        username,
        email,
        password : hashedPassword
    })

    const token = jwt.sign({
        id : user._id},
        config.JWT_SECRET,{
            expiresIn : "1d"
        }
    )

    res.status(201).json({
        message : "User Registerd",
        user: {
            username : user.username,
            email : user.email,
        },
        token
    })
}

export async function getme(req, res) {
    try{
    const token = req.headers.authorization?.split(" ")[1];

    if(!token){
        return res.status(401).json(
            {
                message : "token not present"
            }
        )
    }

    // const decode = jwt.verify(token, config.JWT_SECRET);
    const {id, iat, exp} = jwt.verify(token, config.JWT_SECRET);

    const user = await usermodel.findById(id);

    if(!user) return res.status(404).json({ message : "user not found"});

    return res.status(200).json({
        username : user.username,
        email : user.email,
        message : "User Details Fetched" 
    });
    }
    catch(err){
    return res.status(401).json({ message : "invalid or expired token", error: err.message});
}} 
