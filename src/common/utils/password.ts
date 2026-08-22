/**
 * TODO: implement password hashing helpers.
 *
 * Purpose: a thin wrapper around bcrypt so the rest of the app never calls
 * bcrypt.hash/bcrypt.compare directly — one place to change the cost factor
 * later, and a clear name (hashPassword) instead of a generic library call
 * at every call site.
 *
 * Not yet installed: this needs the `bcrypt` package (+ its @types/bcrypt
 * dev dependency). Note bcrypt has a native binding, so once added it also
 * needs to go into package.json's `pnpm.onlyBuiltDependencies` list
 * (alongside @prisma/client, @prisma/engines, prisma, which are already
 * there) — otherwise pnpm blocks its build script by default.
 *
 * Suggested exports:
 * - hashPassword(plain: string): Promise<string>
 *     wraps bcrypt.hash(plain, saltRounds) — this is what gets stored in
 *     User.passwordHash
 * - comparePassword(plain: string, hash: string): Promise<boolean>
 *     wraps bcrypt.compare(plain, hash) — used on login to check the
 *     submitted password against the stored hash
 *
 * Cost factor note: bcrypt's saltRounds controls how slow (and therefore
 * how brute-force-resistant) hashing is. 10-12 is the typical range today —
 * higher is more secure but slower per request; worth picking a number
 * deliberately rather than defaulting to whatever a tutorial used.
 */
