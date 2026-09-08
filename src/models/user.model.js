import mongoose from "mongoose";

const userschema = new mongoose.Schema({
    username : {
        type : String,
        require : [true, "username is required"],
        unique : [true, "username is required"]
    },
    email : {
        type : String,
        require : [true, "Email is required"],
        unique : [true, "Email is required"]
    },
    password : {
        type : String,
        require : [true, "Password is required"],
    },
})

const usermodel = mongoose.model("user", userschema)

export default usermodel