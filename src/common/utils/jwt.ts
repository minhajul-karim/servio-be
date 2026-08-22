/**
 * TODO: implement JWT sign/verify helpers.
 *
 * Purpose: a thin wrapper around the `jsonwebtoken` library so the rest of
 * the app never calls jwt.sign/jwt.verify directly — one place to change the
 * algorithm, expiry, or payload shape later without touching every caller.
 *
 * Not yet installed: this needs the `jsonwebtoken` package (+ its
 * @types/jsonwebtoken dev dependency) added to package.json.
 *
 * Not yet in env: this needs a JWT_SECRET value. Add it to the zod schema
 * in src/env.ts (e.g. z.string().min(32)) and to .env / .env.example, the
 * same way DATABASE_URL and PORT are already validated there.
 *
 * Suggested exports:
 * - signToken(payload: { userId: string; userType: UserType }): string
 *     wraps jwt.sign(payload, env.JWT_SECRET, { expiresIn: ... })
 * - verifyToken(token: string): { userId: string; userType: UserType }
 *     wraps jwt.verify(token, env.JWT_SECRET) — this throws on an invalid
 *     or expired token; let it throw and let the caller (requireAuth) catch it
 *
 * Decide and document your payload shape here once you pick it — whatever
 * you sign in auth.service.ts on login must match what requireAuth expects
 * to read back, and what's declared on Request.user in
 * src/common/types/express.d.ts.
 */
