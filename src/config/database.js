import mongoose from "mongoose";
import config from "./config.js";

async function connectDB() {
    try {
        await mongoose.connect(config.MONGO_URL);
        console.log("connected to DB");
    } catch (err) {
        console.error("Failed to connect to DB:", err.message);
        process.exit(1);
    }
}

export default connectDB;
