/**
 * TODO: implement the validate() middleware factory.
 *
 * Purpose: one generic Express middleware that validates part of an
 * incoming request (body, query, or params) against a Zod schema, so every
 * route gets the same parse-or-reject behavior instead of each controller
 * checking its own input by hand.
 *
 * Suggested signature:
 *   validate(schema: ZodSchema, source: "body" | "query" | "params" = "body")
 *     => (req, res, next) => void
 *
 * Behavior to implement:
 * - read req[source]
 * - call schema.safeParse(...) on it (safeParse, not parse, so you can
 *   handle the failure case yourself rather than throwing)
 * - on failure: build a readable message from the ZodError (see
 *   src/env.ts, which already does `z.flattenError(parsed.error).fieldErrors`
 *   for the same purpose — reuse that pattern) and call
 *   next(new AppError(400, ...)) so error-handler.ts formats the response
 * - on success: REPLACE req[source] with the parsed data (parsed.data),
 *   not the raw input — this matters because zod can apply defaults/coercions
 *   (e.g. z.coerce.number()) that the raw request body won't have
 * - call next() with no arguments on success
 *
 * Edge case to think about: don't leak the full internal ZodError object to
 * the client in the response — extract just the field -> message mapping.
 */
