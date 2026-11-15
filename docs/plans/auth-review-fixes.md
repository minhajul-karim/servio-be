# Auth review fixes plan

Status: done (2026-11-14). Steps 1–6 implemented and verified: lint, typecheck and 78/78 tests pass, and the action SHAs are checked against their tags. Not committed yet.

Goal: fix the real problems found by `/code-review high 1` and the commit security check on PR #1 (`feat/auth`) before merging. `/security-review` found no HIGH or MEDIUM issues.

## Triage of the findings

| # | Finding | Verdict |
|---|---|---|
| 1 | Routes share one rate-limit counter per IP | **No change.** Intended: the rate-limit decision groups routes, and `tests/auth/rate-limits.test.ts` "is shared across routes" asserts it |
| 2 | Each `/login` resets `otpAttempts`, so someone with the password gets unlimited sets of 5 OTP guesses | **Fix**, Decision 1 |
| 3 | Emails are not trimmed or lowercased | **Fix**, Decision 2 |
| 4 | The `rename_user_type_to_role` migration drops the column instead of renaming it; `add_user_name` adds NOT NULL with no default | **Decision 3** |
| 5 | `resendOtp` issues new codes for expired, abandoned logins | **Fix**, Decision 4 |
| 6 | Login and forgot-password timing reveals which emails exist | **Defer.** `/register` already answers 409 for taken emails, so hiding the timing alone protects nothing |
| 7 | `verifyEmail` returns 500 on a double click (no transaction) | **Fix**, standard fix in step 4 |
| 8 | `refresh` deletes and creates the session without a transaction | **Fix**, standard fix in step 4 |
| 9 | Two concurrent `verify-otp` calls with the right code create two sessions | **Fix**, standard fix in step 4 |
| — | `claude-code-action@v1` isn't pinned to a commit SHA | **Decision 5** |

---

## Decision 1: stop unlimited OTP guessing

The OTP exists to protect accounts whose password has leaked. Today, every successful `/login` resets the guess counter, and successful logins don't count toward the rate limit.

| | A. Per-account lockout: after 5 wrong codes, block new OTPs for 15 min (`otp_locked_until` column) | B. Count successful logins in the rate limiter too | C. Longer code (8 digits) |
|---|---|---|---|
| Stops a multi-IP attacker | **Yes**, the limit is on the account | No, per IP only | No, only slows them down 100x |
| Effort | 1 migration + small service change | 1 limiter option | Email and test changes |
| Fit with existing decisions | Matches "per-account limits via OTP attempts" | Rate-limit decision chose per IP | — |
| Side effect | A real user who mistypes 5 times waits 15 min | Shared office IPs hit the cap sooner | Harder for users to type |

**Pick A.** It's the only one that caps guesses per account: at most 5 per 15 min, so about 1,000 days to reach a 50% chance of guessing the code. B and C don't stop an attacker who uses many IPs. Blocked `/login` returns `429` + `code: "OTP_LOCKED"` + `retryAfterSeconds`. Only someone who already passed the password check sees it, so it leaks nothing to strangers.

Grilled Q1, lockout abuse: an attacker with a leaked password could keep re-locking the real user. So:
- When a lock happens, email the user: "Someone entered 5 wrong login codes. If this wasn't you, reset your password", with a link to forgot-password.
- `resetPassword` clears the lock. A lock only happens when the password has leaked, so changing the password ends the attack.
- Rejected: no escape route (the user could be locked out forever); escalating lock length (punishes the real user more).
- Grilled Q2: `/login` checks the password **before** the lock, so a wrong password always gets the normal 401 and strangers can't tell a locked account apart. Rejected: lock first (reveals that the email exists and is under attack).
- Careful: `CLEARED_OTP_FIELDS` is also used on the lockout path, so the lock field must **not** go into it. Clear the lock explicitly in reset-password (and change-password).

## Decision 2: email normalization

| | A. Zod: shared `emailField` that trims + lowercases, used by every schema | B. Postgres `CITEXT` column (case-insensitive type) | C. Lowercase in the service before each query |
|---|---|---|---|
| Effort | 1 helper, swapped into the schemas | Migration + Prisma `@db.Citext` + extension | Edit every service function |
| Risk of missing a spot | Low, all input goes through `validate` | None, the DB enforces it | **High**: a new function can forget |
| Stored value | Lowercase | As typed | Lowercase |

**Pick A.** It's one place and matches the existing "validate at the edge" pattern. B adds a Postgres extension for little gain, since every input already passes Zod. C is easy to forget in a new function. Grilled Q3: add a one-off data migration, `UPDATE users SET email = lower(trim(email))`, so old mixed-case rows (local and test DBs, any future copy) keep working. If two rows clash, the unique constraint fails loudly instead of silently merging accounts. Rejected: doing nothing (old rows can't log in) and resetting the DB (only fixes one machine).

## Decision 3: the data-dropping migrations

There's no deployment and no production database yet. These migrations only ran on local and test databases.

| | A. Leave as is, and add a note to the plan | B. Edit the old migration SQL into a real `RENAME` | C. Squash all migrations into one fresh `init` |
|---|---|---|---|
| Effort | None | Small, but breaks the checksum on every DB that already ran it (local reset) | Local reset, new single migration |
| Risk | None now, since no real data exists | Prisma drift errors | Loses the history of how the schema evolved |
| Long-term | History is accurate | — | Cleanest start before the first deploy |

**Pick A.** The bug can only hurt existing rows, and none exist. Rewriting history (B and C) forces database resets for no real gain. Rule for the future: review generated migration SQL for `DROP COLUMN` before committing, and use `--create-only` to hand-edit renames.

## Decision 4: resend for an expired OTP

| | A. Expired OTP counts as "no pending login": 400, log in again | B. Allow resend up to 30 min after the original login | C. Background job clears expired OTPs |
|---|---|---|---|
| Effort | 1 condition | Derive login time, extra rule | Scheduler (none exists) |
| Security | Resend only within the 10-min window that proves a recent password login | Wider window | Same as A, but more moving parts |

**Pick A.** It's the smallest change and keeps "resend needs a recent password login" strict. B weakens that rule for little UX gain, and C needs infrastructure the app doesn't have.

## Decision 5: pin `claude-code-action`?

| | A. Pin to a commit SHA + Dependabot version updates for `github-actions` only | B. Keep `@v1` (official Anthropic action) | C. Pin to a SHA, update by hand |
|---|---|---|---|
| Protection | A changed tag can't run new code unseen | Trusts the tag | Same as A |
| Upkeep | Dependabot opens PRs, maybe monthly | None | Easy to forget, so it goes stale |
| Fit with existing decisions | Adds `dependabot.yml`; the "security updates only" decision was about npm noise, and actions update rarely | Matches `ci.yml` (`actions/*@v4`) | — |

**Pick A.** It's the industry-standard way to protect a workflow that holds a secret, and Dependabot keeps it fresh without npm-level noise. `id-token: write` stays, because the action needs it to get the Claude GitHub App token.

---

## Steps (each one: implementer, test-first, then verify)

1. **Email normalization:** add `emailField` in `auth.schema.ts` and use it in every schema. Add a data-only migration (`prisma migrate dev --create-only`) that lowercases and trims existing emails. Tests: register mixed case, then log in lowercase (works), register `alice@x.com` after `Alice@x.com` (409), forgot-password with a different case (email sent).
2. **OTP lockout:** migration adds `otp_locked_until`. On the 5th wrong code, set it to now + 15 min and clear the OTP. `/login` returns 429 `OTP_LOCKED` while locked. A successful verify resets attempts. A lock sends a "5 wrong codes, reset your password" email. Reset-password and change-password clear the lock. Tests: lockout after 5, lock email sent, login blocked during the lock, login allowed after the lock (fake timers or a DB update), reset-password clears the lock, correct code resets the counter.
3. **Resend on expired OTP:** `resendOtp` returns 400 when `otpExpiresAt < now`. Test: expired OTP gives 400.
4. **Races and transactions:**
   - `verifyEmail` runs in one transaction and claims the token with `deleteMany` + count check; a second click gives a clean 4xx, not a 500.
   - `verifyOtp` claims the code atomically (`updateMany` where `otpCode` matches, check count), so the losing parallel call gets 401.
   - `refresh` deletes and creates inside one transaction, reusing the `createSession` logic.
   - `verifyToken` pins `algorithms: ["HS256"]` (grilled Q5).
   - Tests: parallel double calls for verify-email and verify-otp.
5. **Pin the actions:** pin every action in `claude-review.yml` **and** `ci.yml` to a full commit SHA with a `# vX` comment. Add `.github/dependabot.yml` for the `github-actions` ecosystem only (monthly); npm stays security-only. (Grilled Q4: a narrow exception to the earlier "no version-update PRs" decision, which was about npm noise.)
6. **Main session:** run lint, typecheck and tests, mark the plan done, and record the decisions in memory.

## Out of scope (known, deferred)

- Timing-based email enumeration (#6). Revisit together with `/register`'s 409 if account privacy becomes a requirement.
- `/register` 409 and `/resend-otp` 400 also reveal whether an account exists.
