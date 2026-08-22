/**
 * TODO: augment Express's Request type with a `user` field.
 *
 * Purpose: by default, TypeScript has no idea req.user exists — it's a
 * property requireAuth.ts sets at runtime, not something Express's own
 * types declare. Without this file, every controller reading req.user
 * would need an `as any` or similar escape hatch.
 *
 * What to implement: a global module augmentation, roughly —
 *
 *   import { UserType } from "../../generated/prisma/enums";
 *
 *   declare global {
 *     namespace Express {
 *       interface Request {
 *         user?: {
 *           userId: string;
 *           userType: UserType;
 *         };
 *       }
 *     }
 *   }
 *
 *   export {};  // needed to make this a module, not a script, so `declare global` works
 *
 * Keep this shape in sync with whatever requireAuth.ts actually attaches
 * (which in turn should match whatever payload shape jwt.ts signs on
 * login) — this file doesn't enforce that at runtime, it only describes it
 * to the type checker, so it's on you to keep the three in agreement.
 */
