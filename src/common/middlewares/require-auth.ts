/**
 * TODO: implement the requireAuth middleware.
 *
 * Purpose: verifies the caller is authenticated via a JWT sent as
 * `Authorization: Bearer <token>`, and attaches the decoded payload to
 * req.user so downstream controllers/middleware (like requireRole) can use
 * it. Decision already made: stateless JWT — verify the signature only,
 * no database lookup per request (see src/common/utils/jwt.ts).
 *
 * Steps to implement:
 * 1. read the `Authorization` header off req
 * 2. confirm it's present and formatted as "Bearer <token>" — if not,
 *    call next(new AppError(401, "Missing or malformed Authorization header"))
 * 3. call your verifyToken(token) helper from common/utils/jwt.ts
 * 4. if verification throws (invalid signature or expired token), catch it
 *    and call next(new AppError(401, "Invalid or expired token"))
 * 5. on success, set req.user = <decoded payload> and call next()
 *
 * You'll need req.user to be a known, typed property — see
 * src/common/types/express.d.ts, which augments Express's Request type.
 * Whatever shape you put in the JWT payload when signing (in auth.service.ts,
 * e.g. { userId, userType }) is the same shape you'll read back here and
 * should match what you declare on Request.user.
 *
 * Known limitation worth knowing (not something to fix now): because this
 * is stateless, a user deleted or banned after their token was issued still
 * passes this check until the token naturally expires. Revisit later if
 * that becomes a real requirement.
 */
