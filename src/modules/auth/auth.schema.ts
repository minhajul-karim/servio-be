/**
 * TODO: implement zod schemas for auth request bodies.
 *
 * Purpose: define what a valid request body looks like for each auth
 * endpoint, in one place, so validate() (common/middlewares/validate.ts)
 * can enforce it before the controller ever sees the data.
 *
 * First one needed — registerSchema, for POST /api/auth/register:
 *
 *   export const registerSchema = z.object({
 *     email: z.string().email(),
 *     password: z.string().min(8),
 *   });
 *
 *   export type RegisterInput = z.infer<typeof registerSchema>;
 *
 * Exporting the inferred type (RegisterInput) alongside the schema means
 * auth.service.ts and auth.controller.ts can use it as a TypeScript type
 * without redeclaring the shape by hand — the schema is the single source
 * of truth for both runtime validation and compile-time types.
 *
 * Later, as login / verify-otp / forgot-password / reset-password get
 * built, their schemas go here too, following the same pattern.
 */
