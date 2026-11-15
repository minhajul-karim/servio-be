# Frontend handoff: auth

What the frontend needs to know about how the auth API behaves, grouped by screen. Updated whenever a backend plan has a "Frontend impact" section. Last updated: 2026-11-15.

All routes are under `/api/auth`. Errors look like `{ message, code?, retryAfterSeconds?, details? }`. Branch on `code` where there is one, not on `message`.

## Register

- Field limits:
  - **email**: max 254 characters. It's trimmed and lowercased on the server.
  - **password**: 8–64 characters **and** at most 72 bytes. Emoji and some non-Latin letters take 2–4 bytes, so the server can reject a password shorter than 64 characters. Show the server's message when that happens.
  - **name**: 1–100 characters.
- `409` means the email is already registered.
- After a `201`, show "Check your inbox to verify your email".

## Verify email (link from the email)

- `GET /verify-email?token=…` returns `200 { success: true }`, or `400` if the link is invalid, expired, or already used. A second click gets `400`, so show "Already verified? Try logging in".

## Login

- **Disable the Login button while the request is running.** This prevents double-clicks.
- `200 { otpRequired: true, resendAfterSeconds }`: go to the OTP screen and start a countdown from `resendAfterSeconds`.
  - If the user logs in again within 60 s, the server sends **no new email** and returns the time left. The code already sent still works.
- `401`: "Invalid email or password".
- `403` with `code: "EMAIL_NOT_VERIFIED"`: offer "Resend verification email" (`POST /resend-verification`).
- `429` with `code: "OTP_LOCKED"`: 5 wrong codes were entered. Show "Try again in N minutes" from `retryAfterSeconds`, plus a "Forgot password?" link. The user also gets an email about it.
- `503` with `code: "EMAIL_SEND_FAILED"`: the code email couldn't be sent. Show "Couldn't send the code. Try again", **keep the email and password filled in**, and let the user press Login again right away. "Resend code" won't work in this case.

## OTP screen

- `POST /verify-otp { email, otp, rememberMe }` returns `200 { accessToken, refreshToken }`.
  - **Send the "Keep me logged in" checkbox here as `rememberMe`.** `/login` ignores it.
- `401`: wrong or expired code. After 5 wrong codes the account is locked for 15 min (see `OTP_LOCKED` above).
- "Resend code" (`POST /resend-otp { email }`):
  - Enable it when the countdown ends.
  - `429` means it's too soon.
  - `400` means there's no pending login (the code expired after 10 min, or the email failed). Send the user back to Login.

## Sessions

- The access token lasts 15 min. When it expires, call `POST /refresh { refreshToken }` and **store both new tokens**; the old refresh token stops working.
- A session ends a fixed time after login: **1 day**, or **30 days** with `rememberMe`. Refreshing doesn't extend it. When refresh returns `401`, send the user to Login.
- After logout, an access token can keep working for up to 15 min. Delete both tokens on the client when the user logs out.

## Forgot / reset password

- `POST /forgot-password` always returns success, whether or not the email exists.
- `POST /reset-password { token, password }`: same password rules as Register. `400` means the link is invalid, expired or used.
  - A reset **logs out every device**, and also marks the email as verified, so the user can log in straight away.

## Change password (logged in)

- `POST /change-password { currentPassword, newPassword, refreshToken }` with the access token.
  - Send the current session's `refreshToken`. This session stays logged in, and **every other device is logged out**.
- Error codes:
  - `INVALID_CURRENT_PASSWORD`
  - `SAME_PASSWORD`
  - `INVALID_REFRESH_TOKEN`: send the user to Login.
- Any reset link emailed before the change stops working.

## Rate limits (any screen)

- `429` with `code: "RATE_LIMITED"` means too many requests from this network. Show "Too many attempts, try again later". The `RateLimit` response headers tell you when.
