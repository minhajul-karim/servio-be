/**
 * TODO: implement AppError.
 *
 * Purpose: a custom Error subclass that carries an HTTP status code, so
 * services/controllers can do `throw new AppError(409, "Email already in use")`
 * and have the centralized error-handler middleware turn that into the right
 * HTTP response, instead of every route hand-rolling try/catch + res.status(...).
 *
 * What to implement:
 * - class AppError extends Error
 * - constructor(statusCode: number, message: string)
 * - store statusCode as a public readonly field
 * - consider an `isOperational` boolean (true) to later distinguish
 *   "expected" errors (like this one) from real bugs/unexpected exceptions
 *   in error-handler.ts — operational errors are safe to show a clean
 *   message for; unexpected ones should log and return a generic 500.
 *
 * Gotcha to know about: when a class extends the built-in Error in
 * TypeScript compiled to older JS targets, `instanceof AppError` can fail
 * unless you call `Object.setPrototypeOf(this, AppError.prototype)` in the
 * constructor. Worth testing `err instanceof AppError` once written.
 *
 * Also consider calling `Error.captureStackTrace(this, AppError)` (Node-only
 * API) so the stack trace starts at the throw site, not inside this class.
 */
