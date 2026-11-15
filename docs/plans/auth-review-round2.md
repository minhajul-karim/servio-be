# Auth review round 2 plan

Status: done (2026-11-15). Steps 1–4 done: 105/105 tests, lint + typecheck clean; live: counter survives mail failure, 5 parallel logins → 1 email, parallel resends → 1 email, latin1 → 415 unlogged; earlier live rows still FIXED. Not committed. Source: `/code-review high 4d59085..HEAD`, run on the 4 commits from `auth-live-fixes.md`. Every finding below was checked against the code.

## Triage

| # | Finding | Verdict |
|---|---|---|
| 1 | The 64-char / 72-byte limit on `/login` and `currentPassword` locks out users who already have longer passwords | **Skip.** Nothing is deployed, so no such users exist, and the limit was a grilled decision (`auth-live-fixes.md`, Q3) |
| 2 | On a mail failure, the cleanup sets `otpExpiresAt = null`, so the next `/login` counts the counter as stale and resets `otpAttempts`, which reopens the counter bypass | **Fix**, D1 |
| 3 | The mail-failure cleanup clears `otpCode` without checking that the stored code is still its own, so it can wipe a code that a parallel request just sent | **Fix**, D1 |
| 4 | The login cooldown reads first and writes later, so two logins at the same instant both send a code and the first code stops working | **Fix**, D1 (also applies to `/resend-otp`) |
| 5 | Only `entity.parse.failed` and `entity.too.large` are mapped; other body-parser client errors (unsupported charset or encoding, aborted request) return 500 | **Fix**, D2 |
| 6 | If the cleanup's own DB write throws, it replaces the 503 with a 500 | **Fix**, in D1 |
| 7 | `login` and `resendOtp` both repeat the "sent at = expires at − 10 min" and cooldown math | **Fix**, shared helper in D1 |
| 8 | `shiftLastSent` in `otp-lockout.test.ts` duplicates `endResendCooldown` from `tests/helpers/auth.ts` | **Fix**, step 3 |
| 9 | `vi.spyOn(console, "error")` in `mail-failure.test.ts` is never restored | **Fix**, step 3 |

---

## D1: sending a login code safely (#2, #3, #4, #6, #7)

Today `otpExpiresAt` does two jobs. It is the code's expiry time, and it also tells us when the last code was sent (sent at = expires at − 10 min). Both the 60 s cooldown and the 15 min "is the counter stale?" rule read it.

| | **A. Conditional DB writes** (the write only goes through if the condition still holds) | B. New `otp_sent_at` column | C. Row lock (`SELECT … FOR UPDATE`) while sending |
|---|---|---|---|
| Effort | Small, no migration | Migration + every place that reads the sent time | Small |
| Risk | Low; it's the pattern already used for the token claims (`updateMany` + `count`) | Low | Holds a DB lock while waiting for Gmail; slow sends block other requests |
| Fit with existing decisions | Matches the atomic-claim decisions | New state for what the existing fields already say | Against the "no slow work inside a transaction" practice |
| Fixes #2 | Yes, see the failure rule below | Yes | No |

**Pick A.** B adds a column and a migration for information we already have. C is a known anti-pattern (never hold a lock while waiting on email), and it doesn't fix #2.

The rules:
- **Shared helper (#7):** `lastOtpSentAt(user)` returns `otpExpiresAt − OTP_EXPIRY` (or `null`), and `cooldownRemainingMs(sentAt)` returns the wait left. `login` and `resendOtp` both use them.
- **Atomic claim (#4):** `issueLoginOtp` writes the new code with `updateMany({ where: { id, OR: [{ otpExpiresAt: null }, { otpExpiresAt: { lte: now + OTP_EXPIRY − COOLDOWN } }] } })`, i.e. "only if no code was sent in the last 60 s".
  - `count === 0` means another request just sent a code. No email is sent.
  - `/login` then returns the normal `200 { otpRequired, resendAfterSeconds }`, the same reply as the cooldown path.
  - `/resend-otp` returns its normal 429.
- **Failure cleanup (#2, #3):** `updateMany({ where: { id, otpCode: <this request's hash> } })`, so it only clears its own code. It sets:
  - `otpCode: null`
  - `otpExpiresAt` to `now − COOLDOWN + OTP_EXPIRY`, which puts "last sent" exactly 60 s ago. The cooldown is over, so the user can retry at once. The counter isn't stale (60 s < 15 min), so `otpAttempts` is kept.
  - One `//` comment explains the backdated time, because without it a later edit would likely "fix" it back to `null`.
- **Double-click where the first send fails (grilled Q3):** the losing request answers 200 "code sent" even though the winner's email failed. Accepted: the frontend disables Login while a request is running, and after the cleanup an immediate re-login works. Rejected: making the losing request wait for the winner's email result (needs a lock or polling).
- **Stale window after a failure (grilled Q2):** because "last sent" moves to the failure time, wrong guesses can be remembered a bit longer than 15 min after the original code. Accepted: it needs a mail failure and 4 wrong guesses together, and it errs on the safe side. Rejected: an `otp_sent_at` column (D1 option B).
- **Retry after a failure (grilled Q1):** the frontend shows "Couldn't send the code. Try again" on the login form, with the email and password still filled in, and calls `/login` again. `/resend-otp` stays 400 because no code is stored, so a resend always needs a recent password check. Rejected: keeping the code so resend works (the 60 s cooldown would block the retry, and we'd be storing a code nobody received).
- **Cleanup that fails (#6):** wrap the cleanup in its own `try/catch`, log the error, and still throw 503 `EMAIL_SEND_FAILED`. Worst case, the stored code stays and the user waits 60 s.
- **Unchanged:** the 503 response, attempts never reset on resend, the 15 min stale rule, and the lock.

## D2: other body-parser errors (#5)

| | **A. Generic rule: body-parser errors with `expose: true` and a 4xx `status` return that status** | B. Map each type string (`charset.unsupported`, `encoding.unsupported`, `request.aborted`, …) | C. Leave as is |
|---|---|---|---|
| Effort | 1 branch | One branch per type | None |
| Future-proof | Yes: new parser errors are handled automatically | Misses any type we didn't list | — |
| Leaks internals | No; `expose` is the library's own "safe to show the client" flag | No | 500 + noisy logs |

Grilled Q4: real clients (including Bangla text) always send UTF-8, so this is about log noise from broken or malicious clients, not about real users. Keep it tiny: about 3 lines and one test, with the parser's own message. Rejected: per-type messages (overcomplicated) and skipping it (a client mistake still logs as a server crash).

**Pick A.** Keep the two existing friendly messages (400 "Malformed JSON body", 413 "Request body too large"). After them, any other exposed 4xx from the parser returns `{ message: err.message }` with `err.status`, without `console.error`. 5xx errors and errors without `expose` still go to the 500 path.

---

## Frontend impact

Copied into `docs/frontend-handoff.md`:
- Disable Login while the request is running (Q3).
- After a 503 `EMAIL_SEND_FAILED`, keep the email and password filled in; retry is Login, not Resend (Q1).

---

## Steps (implementer, test-first; the main session verifies each)

1. **D1** in `src/modules/auth/auth.service.ts`. Tests:
   - 4 wrong codes, a cooldown-free login whose email fails (503), then another login: `otpAttempts` is still 4, and the 5th wrong code locks the account.
   - The cleanup leaves a newer code alone (the mock send writes a different `otpCode` to the DB, then rejects; that code must survive).
   - 2 parallel `/login` calls: both 200, exactly 1 code email, and that code verifies.
   - Grilled Q5: no separate tests for parallel resend (same claim path as login) or for a failing cleanup write (hard to fake, a tiny try/catch).
   - Update the existing `mail-failure` assertion: after a failure, `otpCode` is null and `otpExpiresAt` is not null.
2. **D2** in `src/common/middlewares/error-handler.ts`. One test in `tests/app.test.ts`: `Content-Type: application/json; charset=latin1` → 415 and no error log.
3. **Test tidy-ups:**
   - `endResendCooldown(email, ms = COOLDOWN_SHIFT_IN_MS)` in `tests/helpers/auth.ts`; delete `shiftLastSent` and use the helper.
   - Restore the `console.error` spy in `mail-failure.test.ts` with a local `afterEach`. Not a global `restoreMocks`, which could interfere with the mailer `vi.mock` in `tests/setup.ts`.
4. **Acceptance:** lint, typecheck, all tests; rebuild and re-run the live rows #1, #2 and #5 from `accept.mjs`, plus a live double-login and a latin1-charset request. Then grouped commits and a push, both only on the user's go-ahead.
