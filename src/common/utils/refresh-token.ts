/**
 * TODO: implement refresh-token generation and hashing.
 *
 * Purpose: the refresh token is a random opaque value (not a JWT) that gets
 * stored, hashed, in the Session table (tokenHash, expiresAt) and handed to
 * the client raw exactly once. On /refresh or /logout, the client's raw
 * token gets hashed again and looked up directly with
 * `prisma.session.findUnique({ where: { tokenHash } })`.
 *
 * No new dependency needed — Node's built-in `crypto` module covers both
 * pieces:
 *
 * - generateRefreshToken(): string
 *     return crypto.randomBytes(40).toString("hex")
 *     40 random bytes -> an 80-character hex string, high entropy.
 *
 * - hashRefreshToken(token: string): string
 *     return crypto.createHash("sha256").update(token).digest("hex")
 *
 * Why SHA-256 here and NOT bcrypt (like password.ts uses): bcrypt is slow
 * and salts each call differently on purpose, which defeats brute-forcing a
 * low-entropy human password — but that same randomness makes it impossible
 * to look a bcrypt hash up directly by re-hashing input and comparing
 * (you'd have to bcrypt.compare against every stored hash one by one). A
 * refresh token is already a high-entropy random value nobody is guessing,
 * so it doesn't need bcrypt's slowness — it needs a hash that's
 * deterministic (same input always produces the same output), so a direct
 * `WHERE tokenHash = ?` database lookup works. SHA-256 is exactly that.
 *
 * Both functions are used from auth.service.ts: generateRefreshToken() when
 * issuing a new refresh token (login, and again on every /refresh
 * rotation), hashRefreshToken() both when storing it and when looking an
 * incoming token back up.
 */
