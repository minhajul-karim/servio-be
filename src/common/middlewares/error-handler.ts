/**
 * TODO: implement the centralized error-handling middleware.
 *
 * Purpose: the ONE place that turns a thrown/forwarded error into an HTTP
 * response, so every controller/service can just `throw new AppError(...)`
 * (or let any other error propagate) instead of writing its own
 * try/catch + res.status(...).json(...) every time.
 *
 * Express-specific rule: this must be defined with all FOUR parameters
 * (err, req, res, next) — Express detects "this is an error middleware" by
 * counting the function's arity, even though `next` usually goes unused
 * here. It must also be registered LAST, after every route and after
 * notFoundHandler, in app.ts.
 *
 * Behavior to implement:
 * - if err instanceof AppError: respond with status err.statusCode and a
 *   JSON body containing err.message
 * - else if it looks like a known Prisma error (e.g. a
 *   PrismaClientKnownRequestError with code "P2002", which means a unique
 *   constraint was violated — relevant for User.email) map it to a sensible
 *   status (409 Conflict) and message
 * - otherwise: this is an unexpected bug, not a handled case — log the full
 *   error (console.error for now) and respond 500 with a generic message.
 *   Never send the raw error/stack trace to the client in this branch.
 *
 * Since Express 5 (already in use here) forwards errors thrown inside
 * `async` route handlers to this middleware automatically, controllers
 * generally don't need their own try/catch — just `throw` and this file
 * handles the response.
 */
