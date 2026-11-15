# Auth live-tested fixes plan

Status: done (2026-11-15). Steps 1–7 done; live acceptance run: every row FIXED, 101/101 tests, lint + typecheck clean. Not committed. Grilled Q5: live scripts stay in scratchpad; each fix gets a permanent test in `tests/` instead.

Goal: fix every gap that was **reproduced live**: real built server (`dist/`), real Postgres (separate `servio_live` DB), real HTTP calls, with only Gmail swapped for a file. After the fixes, the same scripts are re-run as acceptance tests.

Scripts (scratchpad, not committed): `repro.mjs` (reported findings) and `probe*.mjs` (extra attack paths nobody had flagged).

## Live results

| # | Gap | Live evidence | Plan |
|---|---|---|---|
| 1 | Re-login resets the wrong-code counter, so the lock never fires | 4 wrong, re-login (attempts 4 → 0), 4 wrong: `otp_locked_until = null`, 0 lock emails | Fix, D1 |
| 2 | `/login` floods code emails | 5 logins in seconds: 5 code emails | Fix, D1 |
| 3 | Reset link survives change-password | change-password 200, then old reset link 200 | Fix: change-password deletes reset tokens |
| 4 | Bad or oversized JSON returns 500 | `{bad json` → 500; 200 KB body → 500 | Fix: error handler maps body-parser errors to 400 / 413 |
| 5 | SMTP failure on login: 500 + resend blocked | login 500, OTP saved anyway, resend 429 | Fix: on send failure, clear the OTP and return 503 `EMAIL_SEND_FAILED` |
| 9 | Refresh gives a fresh full lifetime | 1-day session aged 23 h → refreshed → expires in 24 h (≈47 h total) | D2 |
| 10a | `rememberMe` on `/login` is ignored | `rememberMe: true` on login → 1-day session | D3 |
| 10b | `PasswordResetToken.used` is never read or written | Tokens are deleted when used; column exists | Fix: migration drops the column |
| P1 | bcrypt only checks the first 72 bytes of a password | Register with 72 chars + "SECRET-TAIL", log in with 72 chars + anything: 200 | Fix: shared `passwordField` = 8–64 chars **and** ≤ 72 bytes (UTF-8), used by register, reset and change (new password). Login and current-password fields get the same max so oversized input never reaches bcrypt (grilled Q3, NIST-style limits) |
| P2 | Unbounded `name` | 50,000-char name → 201 | Fix: `name` 1–100; `emailField` max 254 (RFC 5321) |
| P3 | Unbounded password | 90,000-char password → 201 | Covered by P1 |
| P11 | Reset on an unverified account leaves it unverified | reset 200, login 403 `EMAIL_NOT_VERIFIED` | D4 |
| P13 | `X-Powered-By: Express` header | Present | D5 |
| P10 | Access token still works after logout | `/me` 200 after logout | **No change.** Normal JWT trade-off: it dies within 15 min. Instant revocation would need a DB lookup per request |

**Probed and safe:** non-JSON or empty body (400); array query params (400); 3 parallel registers (201, 409, 409); verify-link reuse (400); refresh-token reuse after rotation (401); `X-Forwarded-For` spoofing (still 429 on the 11th try); correct code after a lock (401).

**Known and deferred (decided before):** timing-based email enumeration; old data-dropping migrations; the lowercase migration failing loudly on duplicate emails.

---

## D1: wrong-code counter and repeated `/login` (#1, #2)

| | A. Never reset the counter on `/login` | **B. Reset on `/login` only if the last code was sent ≥ 15 min ago; within 60 s of the last code, don't send a new one** | C. Count failures in a rolling-window table |
|---|---|---|---|
| Stops the bypass | Yes | Yes: an attacker has to wait 15 min per 4 guesses, the same rate as the lock | Yes |
| Real-user UX | One typo weeks later can lock you (stale counter) | Old mistakes are forgotten after 15 min | Good |
| Effort | 1 line | Small: reuses `otpExpiresAt` | New table + queries |

**Pick B.**
- Grilled Q1: a counter left over from under 15 min ago carries over (3 wrong → re-login 5 min later → 2 more wrong = lock). Accepted: that's exactly what blocks the re-login trick.
- Within 60 s of the last code, `/login` returns the same `200 { otpRequired, resendAfterSeconds: <remaining> }` without a new email. The existing code stays valid, and the client sees nothing different.
- A rejected: a stale counter punishes real users. C rejected: a new table for what two timestamps already tell us.

## D2: session lifetime on refresh (#9)

Today, every `/refresh` gives a brand-new full lifetime: 1 day, or 30 days with `rememberMe`. So a client that keeps refreshing **never** logs out, and neither does a thief holding a stolen refresh token.

| | A. Keep sliding (today) | **B. Absolute cap: the session can't outlive the original login + 1 day / 30 days** | C. Sliding, with a hard cap (e.g. 30 d idle, 90 d max) |
|---|---|---|---|
| "Remember me" feel | Never logged out while active | Log in again every 30 days | Logged out after 90 days even if active |
| Stolen-token window | Forever, while refreshed | ≤ 30 days | ≤ 90 days |
| Effort | None | Small: copy the original `expiresAt` forward | Extra column (`loginAt`) |

**Pick B.** It matches what the checkbox promises ("keep me logged in for 30 days"), and it limits a stolen token. Implementation: the new session copies the old session's `expiresAt` instead of adding a fresh duration. Grilled Q2: 1 day (default) and 30 days (`rememberMe`), fixed from login, even when the user is active at that moment.

## D3: where `rememberMe` lives (#10a)

The session is created at `/verify-otp`, which already reads `rememberMe`. `/login` accepts it but ignores it. The frontend checkbox has to be sent where the session is created.

| | **A. Remove it from `/login`; the frontend sends it on `/verify-otp`** | B. Save it at `/login` (new column), `/verify-otp` uses the saved value | C. Accept it on both, later one wins |
|---|---|---|---|
| Effort | Remove 1 field | Migration + code | Merge logic |
| Clarity | One place, no ambiguity | Hidden state | Confusing |

**Pick A.** The frontend keeps the checkbox value in memory while the OTP screen is up and sends it with the code. Because Zod strips unknown fields, a client that still sends it to `/login` gets no error.

## D4: password reset on an unverified account (P11)

| | **A. Reset also marks the email verified** | B. Keep it unverified (today) | C. Block forgot-password for unverified accounts |
|---|---|---|---|
| Logic | Clicking the reset link proves inbox ownership, exactly what verification proves | The user must also click a verification email | Leaks which emails are unverified |
| UX | Reset, then log in | Reset, then a 403 surprise | Confusing |

**Pick A.** It's the same proof as verification, so asking twice adds nothing.

## D5: security headers (P13)

| | A. `app.disable("x-powered-by")` | **B. `helmet` middleware** | C. Leave it |
|---|---|---|---|
| Covers | That one header | Industry-standard set (nosniff, frame-deny, HSTS, …) | — |
| Effort | 1 line | 1 dependency + 1 line | None |

**Pick B.** It's the standard Express baseline, and it also removes `X-Powered-By`. A covers only one header, and C leaks the stack for free.

---

## Steps (implementer, test-first; main session verifies each)

1. D1: `/login` counter-reset rule + 60 s no-resend window.
2. #3 + D4: change-password deletes reset tokens; reset-password sets `emailVerified: true`.
3. #4 + D5: error-handler body-parser mapping (400 / 413); add `helmet`.
4. #5: an SMTP failure in `issueLoginOtp` (so both `/login` and `/resend-otp`) clears `otpCode` + `otpExpiresAt` and returns 503 `EMAIL_SEND_FAILED`, so the retry isn't blocked by the cooldown. Grilled Q4. Careful: do **not** use `CLEARED_OTP_FIELDS` here, because that resets `otpAttempts` and would reopen the counter bypass. Keep the attempts.
5. D2: refresh copies `expiresAt` (absolute cap).
6. P1 / P2 + D3 + #10b: password 8–64 chars and ≤ 72 bytes, email ≤ 254, `name` 1–100, remove `rememberMe` from `loginSchema`, migration dropping `password_reset_tokens.used`.
7. **Acceptance:** rebuild, re-run `repro.mjs` + `probe*.mjs` against the live server. Every row above must flip to fixed; lint, typecheck and tests must pass.
