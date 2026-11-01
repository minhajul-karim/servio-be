# Auth module completion plan

Status: proposed, awaiting approval (2026-11-01)

Four pieces of work, in this order:

1. Fix lint (so new code starts clean)
2. Change password endpoint
3. Deploy-time config (`trust proxy` + CORS)
4. Automated tests (last, so they cover the final code)

Why this order: the change-password handler would otherwise be written in the same style that lint rejects. Tests come last so they test the finished module once, instead of being rewritten.

---

## 1. Fix lint

**Problem:** `pnpm lint` fails with 21 errors, all `no-empty-object-type`, all from `Request<{}, {}, Body>` in `auth.controller.ts`. The `{}` means "params object with nothing in it", but `{}` in TypeScript actually means "any non-null value", so the rule flags it.

| | A. Small typed request helpers | B. Turn the rule off | C. Drop the generics |
|---|---|---|---|
| What | `BodyRequest<T>` / `QueryRequest<T>` types in one shared file, used by handlers | Disable `no-empty-object-type` in `eslint.config.js` | Plain `Request`, cast `req.body` inside each handler |
| Effort | Small | Smallest | Small |
| Risk | None | Hides the rule everywhere, including real mistakes | Casts lose type safety in every handler |
| Long-term | Handlers get shorter and clearer | Lint debt | More casting as the app grows |

**Pick A.** B silences a useful rule, and C trades a lint error for weaker types.

Steps:
- Create `src/common/types/request.ts` with `BodyRequest<T>` and `QueryRequest<T>`, built on Express's `ParamsDictionary` instead of `{}`.
- Replace every `Request<{}, {}, X>` and `Request<{}, {}, {}, X>` in the controller.
- Done when `pnpm lint` exits 0.

---

## 2. Change password

`POST /api/auth/change-password`, behind `requireAuth`. Body: `{ currentPassword, newPassword, refreshToken }`.

### Decision: what happens to logged-in sessions?

| | A. Keep this device, log out all others | B. Log out everywhere, return fresh tokens | C. Log out everywhere, user signs in again |
|---|---|---|---|
| How | Client sends its `refreshToken`; delete every other session | Delete all sessions, create a new one | Delete all sessions |
| User experience | Best: stays signed in here | Good, but a 30-day "remember me" silently becomes 1 day (the access token doesn't know the original length) | Worst: full login + OTP again |
| Effort | Small | Small | Smallest |
| Security | Other devices lose access within 15 min (access-token lifetime) | Same | Same |

**Pick A.** B quietly shortens "remember me", and C is needlessly annoying.

### Rules
- Wrong current password → `400 "Current password is incorrect"`, `code: INVALID_CURRENT_PASSWORD`. Not `401`: frontends treat `401` as "token expired" and try to refresh or log out, which is the wrong reaction here.
- New password the same as the current one → `400`, `code: SAME_PASSWORD`.
- New password must be at least 8 characters (same as register).
- The `refreshToken` must belong to this user, otherwise `400`.
- In one transaction: update the password hash, delete the user's other sessions, clear any pending OTP (same reasoning as reset-password).
- Rate limit: `loginBruteForceLimiter`. A stolen access token could otherwise be used to guess the current password. Only failures count, so normal users are unaffected.

Steps (implementer): schema, service, controller, route.

---

## 3. Deploy-time config

These only matter once the app runs on a real server, but they're cheap to set up right now.

### 3a. `trust proxy`

**What it is:** in production the app usually sits behind a proxy (Render, Railway, Fly, nginx). Every request then arrives *from the proxy*, so `req.ip` is the proxy's address for every user. The rate limiter would treat all users as one person and block everyone together. `trust proxy` tells Express to read the real user IP from the `X-Forwarded-For` header the proxy adds.

| | A. Configurable via env (`TRUST_PROXY`, number of proxy hops, default 0) | B. Always `1` | C. Always `true` |
|---|---|---|---|
| Local dev (no proxy) | Correct | **Unsafe**: anyone can fake their IP with a header and dodge rate limits | **Unsafe**, same problem |
| Production | Set `TRUST_PROXY=1` | Correct for a single proxy | Trusts anything, so spoofable |
| Effort | Small | Smallest | Smallest |

**Pick A.** It's correct in both places. B and C let attackers fake their IP when no proxy is present.

### 3b. CORS

**What it is:** a browser rule. A page on `frontend.com` may only call `api.com` if the API says "I allow `frontend.com`". It doesn't apply to server-to-server calls (for example Next.js server actions), only to browser calls.

| | A. Allow only `FRONTEND_URL` (already in env) | B. No CORS (server-to-server only) | C. Allow all origins |
|---|---|---|---|
| Next.js server actions | Works | Works | Works |
| Client components calling the API directly | Works | **Blocked** | Works |
| Security | Only your frontend | Strictest | Any website can call your API from a user's browser |
| Effort | Small (`cors` package) | None | Small |

**Pick A.** It keeps both frontend styles possible at almost no cost. B forces one architecture, and C is too open.

Steps (implementer): `TRUST_PROXY` in `env.ts` + `app.set`, `cors` with `FRONTEND_URL`, `.env.example` updated.

---

## 4. Automated tests

### Decision: what kind of tests?

| | A. API tests against a real test database | B. Unit tests with a mocked database | C. Scripts against a running server (what we did by hand) |
|---|---|---|---|
| What | Send real HTTP requests to the app in memory (Supertest), real Postgres test DB, fake email sender | Test service functions with Prisma replaced by fakes | Start the server, call it with fetch |
| Catches real bugs | Yes: SQL, transactions, validation, middleware, limiters | Partly: mocks can lie (pass while the real DB fails) | Yes |
| Speed | Fast enough (seconds) | Fastest | Slow, needs a running server |
| Can read OTP codes / email links | Yes, the fake email sender records them | Yes | No: the real email goes out, so tests seed hashes in the DB instead |
| Effort | Medium (one-time setup) | Medium, plus maintaining mocks | Low, but brittle |

**Pick A.** Auth bugs live in the glue (middleware order, transactions, DB constraints), which B can't see. C is what we've been doing by hand and doesn't scale. `app.ts` is already separate from `index.ts`, so the app can be tested without starting a server.

### Decision: test runner

| | A. Vitest | B. Jest | C. Node's built-in `node:test` |
|---|---|---|---|
| TypeScript | Works out of the box | Needs `ts-jest` or Babel config | Needs a loader (`tsx`) |
| Mocking a module (the mailer) | Built in (`vi.mock`) | Built in | Limited |
| Speed / DX | Fast, good watch mode | Slower | Basic output |

**Pick A.** Least setup for TypeScript and easy mocking. Jest needs config, and `node:test` is weak at mocking.

### Test setup
- **Test database:** a separate `servio_test` database in the same Postgres container. `.env.test` points at it. Migrations run before the tests (`prisma migrate deploy`), and tables are emptied between tests.
- **Email:** the mailer module is replaced by a fake that records messages, so tests can read OTP codes and verification/reset links. No real emails are sent.
- **Rate limiters:** their memory store is reset before each test, so one test's attempts don't block the next.
- **Scripts:** `pnpm test` and `pnpm test:watch`.

### What gets tested (one file per area)
- Registration: register, verify-email, resend-verification (cooldown, same response for unknown emails), unverified login → `403 EMAIL_NOT_VERIFIED`.
- Login + OTP: verify-otp success, wrong code, 5-attempt lockout, resend-otp (cooldown `429`, attempts kept).
- Sessions: refresh rotation and preserved duration, logout, `/me` (valid, missing, expired, unknown user).
- Recovery: forgot/reset password (single use, sessions revoked, expired link).
- Change password: success keeps this device, other sessions revoked, wrong current password `400`, same password `400`.
- Rate limits: 11th failed login `429`, successes not counted, email-sending limit.

Steps (implementer): (1) setup only + one smoke test, (2-4) test files, a few areas per run.

---

## Decisions log

| # | Decision | Chosen |
|---|---|---|
| 1 | Lint fix | Typed request helpers (`BodyRequest<T>`, `QueryRequest<T>`) |
| 2 | Sessions on password change | Keep current device, revoke others (client sends refreshToken) |
| 3 | Wrong current password status | `400 INVALID_CURRENT_PASSWORD`, not `401` |
| 4 | trust proxy | Env-configurable hop count, default 0 |
| 5 | CORS | Allow only `FRONTEND_URL` |
| 6 | Test type | API tests, real test DB, fake mailer |
| 7 | Test runner | Vitest + Supertest |
