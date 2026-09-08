import dotenv from "dotenv";
dotenv.config();

const config = {
    MONGO_URL : process.env.MONGO_URL
}

export default config;