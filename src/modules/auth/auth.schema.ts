import { z } from "zod";

const MAX_PASSWORD_LENGTH = 64;
const MAX_PASSWORD_BYTES = 72;

const emailField = z.string().trim().toLowerCase().max(254).pipe(z.email()).meta({
  description: "Email address. Trimmed and lowercased by the server. Max 254 characters.",
  example: "user@example.com",
});

const withByteLimit = (schema: z.ZodString) =>
  schema
    .max(MAX_PASSWORD_LENGTH)
    .refine((value) => Buffer.byteLength(value, "utf8") <= MAX_PASSWORD_BYTES, {
      message: "Password is too long",
    });

const passwordField = withByteLimit(z.string().min(8)).meta({
  description:
    "8 to 64 characters and at most 72 bytes. Emoji and some non-Latin letters use 2 to 4 bytes each, so a password under 64 characters can still be rejected.",
  example: "correct-horse-battery",
});

const existingPasswordField = withByteLimit(z.string().min(1)).meta({
  description: "The account's current password. Up to 64 characters and at most 72 bytes.",
  example: "correct-horse-battery",
});

export const registerSchema = z.object({
  email: emailField,
  password: passwordField,
  name: z.string().trim().min(1).max(100).meta({
    description: "Display name, 1 to 100 characters. Trimmed by the server.",
    example: "Jane Doe",
  }),
});

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailField,
  password: existingPasswordField,
});

export type LoginInput = z.infer<typeof loginSchema>;

export const verifyOtpSchema = z.object({
  email: emailField,
  otp: z
    .string()
    .regex(/^\d{6}$/)
    .meta({
      description: "The 6-digit code emailed after login.",
      example: "123456",
    }),
  rememberMe: z.boolean().optional().default(false).meta({
    description: "When true the session lasts 30 days instead of 1 day. Defaults to false.",
    example: false,
  }),
});

export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;

export const resendOtpSchema = z.object({ email: emailField });

export type ResendOtpInput = z.infer<typeof resendOtpSchema>;

export const forgotPasswordSchema = z.object({
  email: emailField,
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().meta({
    description: "The token from the password reset link in the email.",
    example: "3f1c9a7e5b2d4c6a8e0f1b3d5c7a9e2f",
  }),
  password: passwordField.meta({
    description: "The new password. 8 to 64 characters and at most 72 bytes.",
  }),
});

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const changePasswordSchema = z.object({
  currentPassword: existingPasswordField,
  newPassword: passwordField.meta({
    description:
      "The new password. 8 to 64 characters and at most 72 bytes. Must differ from the current one.",
    example: "new-horse-battery-staple",
  }),
  refreshToken: z.string().meta({
    description: "The refresh token of the current session. That session stays signed in.",
    example: "9b2e4d6f8a1c3e5b7d9f0a2c4e6b8d1f",
  }),
});

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().meta({
    description: "The refresh token issued at login or by the previous refresh.",
    example: "9b2e4d6f8a1c3e5b7d9f0a2c4e6b8d1f",
  }),
});

export type RefreshInput = z.infer<typeof refreshSchema>;

export const logoutSchema = refreshSchema;

export type LogoutInput = z.infer<typeof logoutSchema>;

export const verifyEmailSchema = z.object({
  token: z.string().meta({
    description: "The token from the verification link in the email.",
    example: "3f1c9a7e5b2d4c6a8e0f1b3d5c7a9e2f",
  }),
});

export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

export const resendVerificationSchema = z.object({ email: emailField });

export type ResendVerificationInput = z.infer<typeof resendVerificationSchema>;
