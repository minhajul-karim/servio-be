import { Router } from "express";
import { validate } from "../../common/middlewares/validate";
import { registerSchema, loginSchema, refreshSchema } from "./auth.schema";
import * as authController from "./auth.controller";

const router = Router();

router.post("/register", validate(registerSchema), authController.register);
router.post("/login", validate(loginSchema), authController.login);
router.get("/verify-email", authController.verify);
router.post("/refresh", validate(refreshSchema), authController.refresh);

/**
 * TODO: add once auth.controller.ts implements it:
 * router.post("/logout", validate(logoutSchema), authController.logout);
 */

export default router;
