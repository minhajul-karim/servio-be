import { Router } from "express";
import { validate } from "../../common/middlewares/validate";
import { requireAuth } from "../../common/middlewares/require-auth";
import {
  registerSchema,
  loginSchema,
  verifyOtpSchema,
  resendOtpSchema,
  refreshSchema,
  logoutSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  resendVerificationSchema,
} from "./auth.schema";
import * as authController from "./auth.controller";
import {
  generalRequestLimiter,
  loginBruteForceLimiter,
  emailSendingLimiter,
} from "../../common/middlewares/rate-limit";

const router = Router();

router.use(generalRequestLimiter);

router.post("/register", emailSendingLimiter, validate(registerSchema), authController.register);
router.post("/login", loginBruteForceLimiter, validate(loginSchema), authController.login);
router.post(
  "/verify-otp",
  loginBruteForceLimiter,
  validate(verifyOtpSchema),
  authController.verifyOtp,
);
router.post(
  "/resend-otp",
  emailSendingLimiter,
  validate(resendOtpSchema),
  authController.resendOtp,
);
router.get("/verify-email", validate(verifyEmailSchema, "query"), authController.verify);
router.post(
  "/resend-verification",
  emailSendingLimiter,
  validate(resendVerificationSchema),
  authController.resendVerificationEmail,
);
router.post("/refresh", validate(refreshSchema), authController.refresh);
router.post("/logout", validate(logoutSchema), authController.logout);
router.post(
  "/forgot-password",
  emailSendingLimiter,
  validate(forgotPasswordSchema),
  authController.forgotPassword,
);
router.post("/reset-password", validate(resetPasswordSchema), authController.resetPassword);
router.get("/me", requireAuth, authController.me);

export default router;
