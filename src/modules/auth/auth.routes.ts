import { Router } from "express";
import { validate } from "../../common/middlewares/validate";
import {
  registerSchema,
  loginSchema,
  verifyOtpSchema,
  refreshSchema,
  logoutSchema,
} from "./auth.schema";
import * as authController from "./auth.controller";

const router = Router();

router.post("/register", validate(registerSchema), authController.register);
router.post("/login", validate(loginSchema), authController.login);
router.post("/verify-otp", validate(verifyOtpSchema), authController.verifyOtp);
router.get("/verify-email", authController.verify);
router.post("/refresh", validate(refreshSchema), authController.refresh);
router.post("/logout", validate(logoutSchema), authController.logout);

export default router;
