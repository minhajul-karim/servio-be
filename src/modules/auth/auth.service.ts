/**
 * TODO: implement auth business logic.
 *
 * Purpose: this is where the actual "what does registering/logging in/
 * refreshing/logging out mean" logic lives — independent of Express
 * req/res, so it's easy to reason about (and later, test) without spinning
 * up an HTTP request. The controller's job is just to call these functions
 * and shape the response; this file's job is the real work.
 *
 * register(input: RegisterInput):
 *   1. look up an existing user by email:
 *      prisma.user.findUnique({ where: { email: input.email } })
 *      - if found, throw new AppError(409, "Email already in use")
 *   2. hash the password:
 *      const passwordHash = await hashPassword(input.password)
 *      (from common/utils/password.ts)
 *   3. create the user:
 *      prisma.user.create({ data: {
 *        email: input.email,
 *        name: input.name,
 *        passwordHash,
 *        userType: "CUSTOMER",
 *        emailVerified: false,
 *      }})
 *   4. return the created user
 *   Decide here (and document your choice) whether this function returns
 *   the raw Prisma result including passwordHash, or strips it before
 *   returning — either way, passwordHash must never reach the HTTP
 *   response, so the stripping has to happen somewhere between here and
 *   auth.controller.ts.
 *   Not in scope yet: OTP generation/sending — register just creates the
 *   row for now.
 *
 * login(input: LoginInput):
 *   1. find the user by email:
 *      prisma.user.findUnique({ where: { email: input.email } })
 *      - if not found, throw new AppError(401, "Invalid email or password")
 *   2. verify the password:
 *      const ok = await comparePassword(input.password, user.passwordHash)
 *      - if false, throw the SAME AppError(401, "Invalid email or password")
 *        as step 1 — deliberately identical wording either way, so a caller
 *        can't tell "wrong email" from "wrong password" by the error message
 *   3. mint the access token:
 *      const accessToken = signToken({ userId: user.id, userType: user.userType })
 *      (from common/utils/jwt.ts)
 *   4. mint the refresh token:
 *      const refreshToken = generateRefreshToken()
 *      const tokenHash = hashRefreshToken(refreshToken)
 *      (both from common/utils/refresh-token.ts)
 *      const expiresAt = input.rememberMe
 *        ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)   // 30 days
 *        : new Date(Date.now() + 24 * 60 * 60 * 1000)         // 1 day
 *      await prisma.session.create({ data: { userId: user.id, tokenHash, expiresAt } })
 *   5. return { accessToken, refreshToken }
 *
 * refresh(input: RefreshInput):
 *   1. hash the incoming token: const tokenHash = hashRefreshToken(input.refreshToken)
 *   2. look up the session, pulling the related user along with it:
 *      const session = await prisma.session.findUnique({
 *        where: { tokenHash },
 *        include: { user: true },
 *      })
 *      (the include is what gives you userType for the new access token,
 *      without a second query)
 *   3. if !session or session.expiresAt < new Date(), throw
 *      new AppError(401, "Invalid or expired refresh token")
 *   4. rotate: delete the old session row —
 *      await prisma.session.delete({ where: { id: session.id } })
 *   5. mint a brand-new access token AND a brand-new refresh token, exactly
 *      like steps 3-4 of login() above (reuse session.user.id / .userType,
 *      and session.expiresAt to preserve the original rememberMe duration
 *      rather than resetting it — your call whether to preserve or reset it,
 *      just be deliberate about it)
 *   6. return { accessToken, refreshToken } (the NEW pair)
 *
 * logout(input: RefreshInput or a dedicated LogoutInput — see auth.schema.ts):
 *   1. hash the incoming token: const tokenHash = hashRefreshToken(input.refreshToken)
 *   2. await prisma.session.deleteMany({ where: { tokenHash } })
 *      deleteMany (not delete) on purpose — logging out twice, or with an
 *      already-expired/already-rotated token, should just no-op rather than
 *      throw a "not found" error
 *   3. nothing meaningful to return — the controller can just send a 204 or
 *      a simple { success: true }
 *
 * You'll need the Prisma client — import it from common/prisma.ts (the
 * shared singleton), not a new PrismaClient() in this file.
 */
