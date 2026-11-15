# Frontend handoff: auth

Screen-level advice for the frontend, grouped by screen. Updated whenever a backend plan has a "Frontend impact" section. Last updated: 2026-11-15.

**Endpoint details (fields, limits, status codes, error `code`s, example bodies) live at `/docs`.** The raw spec is at `/openapi.json`; feed it to a generator such as `openapi-typescript` to get TypeScript types. This file only covers what to do with the API on each screen.

Branch on an error's `code` where there is one, not on `message`.

## Register

- Show the server's message when it rejects a password. The limit counts bytes as well as characters, so a short emoji-heavy password can fail.
- A "email already in use" error means the email is registered. Offer Login.
- After a success, show "Check your inbox to verify your email".

## Verify email (link from the email)

- A second click on the same link fails, so on an error show "Already verified? Try logging in".

## Login

- **Disable the Login button while the request is running.** This prevents double-clicks.
- On success, go to the OTP screen and start a countdown from `resendAfterSeconds`.
  - If the user logs in again within 60 s, the server sends **no new email** and returns the time left. The code already sent still works.
- Wrong email or password: show "Invalid email or password".
- `EMAIL_NOT_VERIFIED`: offer "Resend verification email".
- `OTP_LOCKED`: 5 wrong codes were entered. Show "Try again in N minutes" from `retryAfterSeconds`, plus a "Forgot password?" link. The user also gets an email about it.
- `EMAIL_SEND_FAILED`: the code email couldn't be sent. Show "Couldn't send the code. Try again", **keep the email and password filled in**, and let the user press Login again right away. "Resend code" won't work in this case.

## OTP screen

- **Send the "Keep me logged in" checkbox with the OTP request as `rememberMe`.** Login ignores it.
- A wrong or expired code shows an inline error. After 5 wrong codes the account is locked for 15 min (see `OTP_LOCKED` above).
- "Resend code":
  - Enable it when the countdown ends.
  - A "too soon" error (`429` with no `code`) means the countdown isn't over yet.
  - A "no pending login" error (`400` with no `code`) means the code expired (10 min) or the email failed. Send the user back to Login.

## Sessions

- The access token lasts 15 min. When it expires, refresh and **store both new tokens**; the old refresh token stops working.
- A session ends a fixed time after login: **1 day**, or **30 days** with `rememberMe`. Refreshing doesn't extend it. When refresh fails with an auth error, send the user to Login.
- After logout, an access token can keep working for up to 15 min. Delete both tokens on the client when the user logs out.

## Forgot / reset password

- Forgot password always looks like a success, whether or not the email exists. Show "If an account exists, we sent a link".
- An invalid, expired or used reset link: show an error and offer to request a new one.
- A reset **logs out every device**, and also marks the email as verified, so the user can log in straight away.

## Change password (logged in)

- Send the current session's `refreshToken`. This session stays logged in, and **every other device is logged out**.
- `INVALID_CURRENT_PASSWORD` and `SAME_PASSWORD`: show inline on the matching field.
- `INVALID_REFRESH_TOKEN`: send the user to Login.
- Any reset link emailed before the change stops working.

## Rate limits (any screen)

- `RATE_LIMITED` means too many requests from this network. Show "Too many attempts, try again later". The `RateLimit` response headers tell you when.
