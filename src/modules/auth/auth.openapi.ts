import { z } from "zod";
import { jsonError, jsonResponse } from "../../docs/components";
import {
  registerSchema,
  loginSchema,
  verifyOtpSchema,
  resendOtpSchema,
  refreshSchema,
  logoutSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  verifyEmailSchema,
  resendVerificationSchema,
} from "./auth.schema";

const UserSchema = z
  .object({
    id: z.uuid().meta({ example: "0b6f1c2e-6a3d-4f0e-9c1a-3d5e7f9a1b2c" }),
    email: z.string().meta({ example: "user@example.com" }),
    name: z.string().meta({ example: "Jane Doe" }),
    role: z.enum(["SUPER_ADMIN", "COMPANY_OWNER", "STAFF", "CUSTOMER"]).meta({
      example: "CUSTOMER",
    }),
    emailVerified: z.boolean().meta({ example: true }),
    selectedRestaurantId: z.uuid().nullable().meta({
      description: "The restaurant the user last selected, or null.",
      example: null,
    }),
  })
  .meta({ id: "User" });

const TokensSchema = z
  .object({
    accessToken: z.string().meta({
      description: "JWT sent as `Authorization: Bearer <token>`. Valid for 15 minutes.",
    }),
    refreshToken: z.string().meta({
      description:
        "Opaque token for POST /api/auth/refresh. Single use: each refresh returns a new one.",
    }),
  })
  .meta({ id: "Tokens" });

const SuccessSchema = z.object({ success: z.literal(true) }).meta({ id: "Success" });

const MessageSchema = z.object({
  message: z.string().meta({
    example: "If an account exists for that email, a reset link has been sent",
  }),
});

const LoginResponseSchema = z.object({
  otpRequired: z.literal(true),
  resendAfterSeconds: z.number().int().meta({
    description:
      "Seconds until a new code can be requested. If a code was sent less than 60 seconds ago no new email is sent, and this is the time left.",
    example: 60,
  }),
});

const ResendOtpResponseSchema = z.object({
  resendAfterSeconds: z.number().int().meta({ example: 60 }),
});

const ResendVerificationResponseSchema = z.object({
  message: z.string().meta({
    example: "If that account exists and is unverified, a new verification link has been sent",
  }),
  resendAfterSeconds: z.number().int().meta({ example: 60 }),
});

const tooLarge = jsonError("Body larger than 100 kB");

const validation = (extra = "") => jsonError(`Validation failed${extra}`);

const rateLimited = jsonError("Too many requests (RATE_LIMITED)");

export const authPaths = {
  "/api/auth/register": {
    post: {
      summary: "Create an account",
      description:
        "Creates an unverified CUSTOMER account and emails a verification link that is valid for 24 hours. If the email fails to send the account is still created and the response is still 201; use resend-verification to get a new link. Limit: 10 per hour, shared with the other email-sending routes.",
      tags: ["Auth"],
      requestBody: { content: { "application/json": { schema: registerSchema } } },
      responses: {
        "201": jsonResponse("Account created", UserSchema),
        "400": validation(),
        "409": jsonError("Email already in use"),
        "413": tooLarge,
        "429": rateLimited,
      },
    },
  },
  "/api/auth/login": {
    post: {
      summary: "Log in with email and password",
      description:
        "Checks the credentials and emails a 6-digit code that is valid for 10 minutes. Finish with verify-otp. If a code was sent less than 60 seconds ago no new email is sent and the response returns the time left. Limit: 10 failed attempts per 15 minutes per network. `OTP_LOCKED` lasts 15 minutes and carries `retryAfterSeconds`.",
      tags: ["Auth"],
      requestBody: { content: { "application/json": { schema: loginSchema } } },
      responses: {
        "200": jsonResponse(
          "Credentials accepted, code sent (or already sent)",
          LoginResponseSchema,
        ),
        "400": validation(),
        "401": jsonError("Wrong email or password"),
        "403": jsonError("Email not verified (EMAIL_NOT_VERIFIED)"),
        "413": tooLarge,
        "429": jsonError("Too many wrong codes (OTP_LOCKED) or too many requests (RATE_LIMITED)"),
        "503": jsonError("Code email not sent (EMAIL_SEND_FAILED)"),
      },
    },
  },
  "/api/auth/verify-otp": {
    post: {
      summary: "Exchange the emailed code for tokens",
      description:
        "Completes login. The session lasts 1 day, or 30 days with `rememberMe`, and refreshing does not extend it. The 5th wrong code locks login for 15 minutes. Limit: 10 failed attempts per 15 minutes per network.",
      tags: ["Auth"],
      requestBody: { content: { "application/json": { schema: verifyOtpSchema } } },
      responses: {
        "200": jsonResponse("Logged in", TokensSchema),
        "400": validation(),
        "401": jsonError("Wrong or expired code"),
        "413": tooLarge,
        "429": rateLimited,
      },
    },
  },
  "/api/auth/resend-otp": {
    post: {
      summary: "Send a new login code",
      description:
        "Emails a new code for a login that is waiting for its code. Allowed once every 60 seconds. The wrong-code counter is not reset. A call inside the 60 seconds returns 429 with no `code`. Without a pending unexpired code it returns 400 with no `code`. Limit: 10 per hour, shared with the other email-sending routes.",
      tags: ["Auth"],
      requestBody: { content: { "application/json": { schema: resendOtpSchema } } },
      responses: {
        "200": jsonResponse("New code sent", ResendOtpResponseSchema),
        "400": validation(", or no pending login"),
        "413": tooLarge,
        "429": jsonError("Resend too soon, or too many requests (RATE_LIMITED)"),
        "503": jsonError("Code email not sent (EMAIL_SEND_FAILED)"),
      },
    },
  },
  "/api/auth/verify-email": {
    get: {
      summary: "Verify an email address",
      description:
        "Called with the token from the verification link. The link works once and expires after 24 hours. An invalid, expired or used link returns 400 with no `code`.",
      tags: ["Auth"],
      requestParams: { query: verifyEmailSchema },
      responses: {
        "200": jsonResponse("Email verified", SuccessSchema),
        "400": jsonError("Missing token, or invalid or expired link"),
        "429": rateLimited,
      },
    },
  },
  "/api/auth/resend-verification": {
    post: {
      summary: "Resend the verification email",
      description:
        "Always returns 200 so it does not reveal whether the email is registered. A new link is sent only to an existing unverified account, and not if one was sent in the last 60 seconds. Limit: 10 per hour, shared with the other email-sending routes.",
      tags: ["Auth"],
      requestBody: { content: { "application/json": { schema: resendVerificationSchema } } },
      responses: {
        "200": jsonResponse("Accepted", ResendVerificationResponseSchema),
        "400": validation(),
        "413": tooLarge,
        "429": rateLimited,
      },
    },
  },
  "/api/auth/refresh": {
    post: {
      summary: "Get a new access token",
      description:
        "Swaps a refresh token for a new access token and a new refresh token. The old refresh token stops working. The session keeps its original end time.",
      tags: ["Auth"],
      requestBody: { content: { "application/json": { schema: refreshSchema } } },
      responses: {
        "200": jsonResponse("New tokens", TokensSchema),
        "400": validation(),
        "401": jsonError("Invalid or expired refresh token"),
        "413": tooLarge,
        "429": rateLimited,
      },
    },
  },
  "/api/auth/logout": {
    post: {
      summary: "End a session",
      description:
        "Deletes the session for the given refresh token. Returns 204 even if the token is unknown. An access token already issued keeps working until it expires (up to 15 minutes).",
      tags: ["Auth"],
      requestBody: { content: { "application/json": { schema: logoutSchema } } },
      responses: {
        "204": { description: "Logged out. No body." },
        "400": validation(),
        "413": tooLarge,
        "429": rateLimited,
      },
    },
  },
  "/api/auth/forgot-password": {
    post: {
      summary: "Email a password reset link",
      description:
        "Always returns 200 so it does not reveal whether the email is registered. If the account exists a reset link valid for 1 hour is emailed, and any earlier link stops working. Limit: 10 per hour, shared with the other email-sending routes.",
      tags: ["Auth"],
      requestBody: { content: { "application/json": { schema: forgotPasswordSchema } } },
      responses: {
        "200": jsonResponse("Accepted", MessageSchema),
        "400": validation(),
        "413": tooLarge,
        "429": rateLimited,
      },
    },
  },
  "/api/auth/reset-password": {
    post: {
      summary: "Set a new password from a reset link",
      description:
        "Sets the password, signs the user out of every device, marks the email as verified and clears any login lock. An invalid, expired or used link returns 400 with no `code`.",
      tags: ["Auth"],
      requestBody: { content: { "application/json": { schema: resetPasswordSchema } } },
      responses: {
        "200": jsonResponse("Password changed", SuccessSchema),
        "400": validation(", or invalid or expired link"),
        "413": tooLarge,
        "429": rateLimited,
      },
    },
  },
  "/api/auth/change-password": {
    post: {
      summary: "Change the password while logged in",
      description:
        "Needs the access token. The session given by `refreshToken` stays signed in and every other session is signed out. Reset links sent earlier stop working. Limit: 10 failed attempts per 15 minutes per network.",
      tags: ["Auth"],
      security: [{ bearerAuth: [] }],
      requestBody: { content: { "application/json": { schema: changePasswordSchema } } },
      responses: {
        "200": jsonResponse("Password changed", SuccessSchema),
        "400": jsonError(
          "Validation failed, or INVALID_CURRENT_PASSWORD / SAME_PASSWORD / INVALID_REFRESH_TOKEN",
        ),
        "401": jsonError("Missing or invalid access token"),
        "413": tooLarge,
        "429": rateLimited,
      },
    },
  },
  "/api/auth/me": {
    get: {
      summary: "Get the current user",
      description: "Returns the logged-in user's public profile, read fresh from the database.",
      tags: ["Auth"],
      security: [{ bearerAuth: [] }],
      responses: {
        "200": jsonResponse("The current user", UserSchema),
        "401": jsonError("Missing or invalid access token"),
        "429": rateLimited,
      },
    },
  },
};
