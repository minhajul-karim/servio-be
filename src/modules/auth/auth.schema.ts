/**
 * TODO: implement zod schemas for auth request bodies.
 *
 * Purpose: define what a valid request body looks like for each auth
 * endpoint, in one place, so validate() (common/middlewares/validate.ts)
 * can enforce it before the controller ever sees the data.
 *
 * registerSchema, for POST /api/auth/register:
 *
 *   export const registerSchema = z.object({
 *     email: z.string().email(),
 *     password: z.string().min(8),
 *   });
 *
 *   export type RegisterInput = z.infer<typeof registerSchema>;
 *
 * loginSchema, for POST /api/auth/login:
 *
 *   export const loginSchema = z.object({
 *     email: z.string().email(),
 *     password: z.string().min(8),
 *     rememberMe: z.boolean().optional().default(false),
 *   });
 *
 *   export type LoginInput = z.infer<typeof loginSchema>;
 *
 * rememberMe controls how long the refresh token lives (see
 * auth.service.ts) — true for "keep me logged in" (long-lived), false for
 * the default shorter session.
 *
 * refreshSchema, for POST /api/auth/refresh:
 *
 *   export const refreshSchema = z.object({
 *     refreshToken: z.string(),
 *   });
 *
 *   export type RefreshInput = z.infer<typeof refreshSchema>;
 *
 * logoutSchema, for POST /api/auth/logout — same shape as refreshSchema
 * (also just needs the raw refresh token to know which Session row to
 * delete). You can reuse refreshSchema directly for this route instead of
 * declaring a separate identical one, if you'd rather not duplicate it —
 * your call.
 *
 * Exporting each inferred type (e.g. RegisterInput, LoginInput) alongside
 * its schema means auth.service.ts and auth.controller.ts can use it as a
 * TypeScript type without redeclaring the shape by hand — the schema is the
 * single source of truth for both runtime validation and compile-time types.
 */
