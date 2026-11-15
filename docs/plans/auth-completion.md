# Auth module completion plan

Status: done (2026-11-13). All four sections implemented; 63 API tests green.

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
- **Test database:** a separate `servio_test` database in the same Postgres container. `.env.test` points at it. Migrations run before the tests (`prisma migrate deploy`). Before each test, one `TRUNCATE ... RESTART IDENTITY CASCADE` empties every table listed in `pg_tables` (except `_prisma_migrations`), so new models are covered automatically.
- **Dev DB safety:** `vitest.config.ts` loads `.env.test` before any app code (dotenv never overrides vars already set, so `.env` can't win). Global setup aborts unless the DB name ends in `_test`.
- **Test DB creation:** global setup creates `servio_test` if it's missing (via the `postgres` maintenance DB), then runs migrations. No manual step.
- **File parallelism:** off (`fileParallelism: false`). All files share one test DB, so parallel files would empty each other's tables.
- **Email:** `vi.mock` the mailer module; `sendMail` pushes `{ to, subject, html }` into an in-memory outbox. Helpers (`lastOtpFor(email)`, `lastLinkFor(email)`) pull the code/token out of the HTML. No app code change, no real emails.
- **Rate limiters:** each limiter gets an explicit `MemoryStore`; `rate-limit.ts` exports `resetRateLimiters()` (calls `resetAll()` on each store), run before each test. Needed because all test requests share one IP and `generalRequestLimiter` (100 / 15 min) would otherwise trip mid-suite.
- **Time-based cases:** no fake clock, no real waiting. Tests move time in the data: set `expiresAt` / `otpExpiresAt` in the past via Prisma, and sign an already-expired JWT for the expired-access-token case.
- **Password hashing cost:** new `BCRYPT_ROUNDS` env (default 12; `.env.test` sets 4). `env.ts` rejects < 10 unless `NODE_ENV=test`. Real bcrypt still runs in tests.
- **Scripts:** `pnpm test` and `pnpm test:watch`.
- **CI:** GitHub Actions workflow (`.github/workflows/ci.yml`) with a Postgres service; runs lint, typecheck (`tsc --noEmit`) and tests on every push and PR.

### What gets tested (one file per area)
- Registration: register, duplicate email `409`, verify-email, resend-verification (cooldown, same response for unknown emails), unverified login → `403 EMAIL_NOT_VERIFIED`, one malformed-body sample → `400 Validation failed`.
- Login + OTP: wrong password and unknown email give the identical `401`, verify-otp success, wrong code, 5-attempt lockout, resend-otp (cooldown `429`, attempts kept).
- Sessions: refresh rotation and preserved duration, reusing a rotated-out refresh token `401`, logout, `/me` (valid, missing, expired, unknown user).
- Recovery: forgot/reset password (single use, sessions revoked, expired link), unknown email gets the same response as a real one.
- Change password: success keeps this device, other sessions revoked, wrong current password `400`, same password `400`, another user's refresh token `400 INVALID_REFRESH_TOKEN`.
- Rate limits: 11th failed login `429`, successes not counted, email-sending limit.
- CORS: `FRONTEND_URL` origin gets `Access-Control-Allow-Origin`, a foreign origin doesn't.

Steps (implementer, one per run, verified before the next):
1. App changes: `BCRYPT_ROUNDS` env + `resetRateLimiters()`. Verify: lint, typecheck, app still boots.
2. Test infra: `vitest.config.ts`, `.env.test`, global setup (`_test` guard, create DB, migrate), truncate, mailer mock + helpers, scripts, one smoke test. Verify: `pnpm test` green twice in a row, dev DB untouched.
3. CI workflow. Verify: green run on push.
4. Tests: registration, login + OTP.
5. Tests: sessions, recovery.
6. Tests: change password, rate limits, CORS.

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
| 8 | Dev DB safety in tests | Vitest loads `.env.test` + `_test` DB-name guard (not `NODE_ENV` env files, not Testcontainers) |
| 9 | Test DB creation | Global setup auto-creates `servio_test` if missing (not manual README step, not Docker init script) |
| 10 | Test file parallelism | Off, files run one at a time (not per-worker DBs, not no-truncation unique data) |
| 11 | Rate limiter reset | Explicit `MemoryStore` per limiter + exported `resetRateLimiters()` (not `vi.resetModules`, not `resetKey(ip)`) |
| 12 | Time-based tests | Edit DB timestamps / sign expired JWT (not fake timers, not tiny env durations + real waits) |
| 13 | bcrypt cost in tests | `BCRYPT_ROUNDS` env, 4 in tests, min 10 outside test (not accept slowness, not mock hashing) |
| 14 | Fake mailer | `vi.mock` mailer → in-memory outbox + extract helpers (not test transport in app code, not Mailpit) |
| 15 | Table cleanup | Dynamic `TRUNCATE` of all tables before each test (not hand-kept `deleteMany` list, not per-test rollback) |
| 16 | CI | GitHub Actions: Postgres service + lint, typecheck, tests on push/PR (not local-only, not pre-push hook) |
| 17 | Extra coverage | Added: duplicate email, uniform login 401, uniform forgot-password reply, rotated refresh reuse, validation sample, foreign refresh token on change-password, CORS |
| 18 | Concurrent refresh race (found by tests: loser got 500) | Claim the session with `deleteMany` + count check → 401 if 0, same as `resetPassword` (not catching P2025, not row locks) |
| 19 | Test file layout | Per-module folders: `tests/auth/*.test.ts`; app-level tests (smoke, cors) stay in `tests/` (not colocated in `src/`, not flat prefixed names) |
