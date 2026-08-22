/**
 * TODO: implement auth business logic.
 *
 * Purpose: this is where the actual "what does registering a user mean"
 * logic lives — independent of Express req/res, so it's easy to reason
 * about (and later, test) without spinning up an HTTP request. The
 * controller's job is just to call these functions and shape the response;
 * this file's job is the real work.
 *
 * First function needed — register:
 *
 *   async function register(input: RegisterInput) {
 *     1. look up an existing user by email:
 *        prisma.user.findUnique({ where: { email: input.email } })
 *        - if found, throw new AppError(409, "Email already in use")
 *     2. hash the password:
 *        const passwordHash = await hashPassword(input.password)
 *        (from common/utils/password.ts)
 *     3. create the user:
 *        prisma.user.create({ data: {
 *          email: input.email,
 *          passwordHash,
 *          userType: "CUSTOMER",
 *          emailVerified: false,
 *        }})
 *     4. return the created user
 *   }
 *
 * Decide here (and document your choice) whether this function returns the
 * raw Prisma result including passwordHash, or strips it before returning —
 * either way, passwordHash must never reach the HTTP response, so the
 * stripping has to happen somewhere between here and auth.controller.ts.
 *
 * Not in scope yet: OTP generation/sending. That's the next endpoint after
 * this one — register just creates the row for now.
 *
 * You'll need the Prisma client — import it from common/prisma.ts (the
 * shared singleton), not a new PrismaClient() in this file.
 */
