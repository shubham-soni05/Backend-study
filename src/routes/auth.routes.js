import { Router } from "express";
import * as authController from "../controllers/auth.controllers.js"

const authRouter = Router();

authRouter.post("/register", authController.register);
authRouter.get("/getme", authController.getme);

export default authRouter;