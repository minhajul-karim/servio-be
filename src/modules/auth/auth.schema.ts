import { z } from "zod";

const MAX_PASSWORD_LENGTH = 64;
const MAX_PASSWORD_BYTES = 72;

const emailField = z.string().trim().toLowerCase().max(254).pipe(z.email());

const withByteLimit = (schema: z.ZodString) =>
  schema
    .max(MAX_PASSWORD_LENGTH)
    .refine((value) => Buffer.byteLength(value, "utf8") <= MAX_PASSWORD_BYTES, {
      message: "Password is too long",
    });

const passwordField = withByteLimit(z.string().min(8));

const existingPasswordField = withByteLimit(z.string().min(1));

export const registerSchema = z.object({
  email: emailField,
  password: passwordField,
  name: z.string().trim().min(1).max(100),
});

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailField,
  password: existingPasswordField,
});

export type LoginInput = z.infer<typeof loginSchema>;

export const verifyOtpSchema = z.object({
  email: emailField,
  otp: z.string().regex(/^\d{6}$/),
  rememberMe: z.boolean().optional().default(false),
});

export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;

export const resendOtpSchema = z.object({ email: emailField });

export type ResendOtpInput = z.infer<typeof resendOtpSchema>;

export const forgotPasswordSchema = z.object({
  email: emailField,
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string(),
  password: passwordField,
});

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const changePasswordSchema = z.object({
  currentPassword: existingPasswordField,
  newPassword: passwordField,
  refreshToken: z.string(),
});

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const refreshSchema = z.object({
  refreshToken: z.string(),
});

export type RefreshInput = z.infer<typeof refreshSchema>;

export const logoutSchema = refreshSchema;

export type LogoutInput = z.infer<typeof logoutSchema>;

export const verifyEmailSchema = z.object({ token: z.string() });

export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

export const resendVerificationSchema = z.object({ email: emailField });

export type ResendVerificationInput = z.infer<typeof resendVerificationSchema>;
