/**
 * TODO: implement the auth router.
 *
 * Purpose: the ONLY place that maps a URL + HTTP method to a controller
 * function (plus whichever middleware runs first) — no logic here, just
 * wiring. Think of this like a router config file (e.g. React Router's
 * route table): it says WHERE things are, not WHAT they do.
 *
 *   import { Router } from "express";
 *   import { validate } from "../../common/middlewares/validate";
 *   import { registerSchema, loginSchema, refreshSchema, logoutSchema } from "./auth.schema";
 *   import * as authController from "./auth.controller";
 *
 *   const router = Router();
 *
 *   router.post("/register", validate(registerSchema), authController.register);
 *   router.post("/login", validate(loginSchema), authController.login);
 *   router.post("/refresh", validate(refreshSchema), authController.refresh);
 *   router.post("/logout", validate(logoutSchema), authController.logout);
 *
 *   export default router;
 *
 * All four are public routes — no requireAuth on any of them:
 * - /register and /login obviously can't require a token the caller
 *   doesn't have yet.
 * - /refresh and /logout authenticate via the refresh token they're given
 *   in the body, not via an access token — that's the whole point of a
 *   refresh endpoint, it's how you get a new access token once the old one
 *   has expired.
 *
 * Later routes (verify-otp, forgot-password, reset-password) get added
 * here the same way, one line each — each with its own schema from
 * auth.schema.ts and its own controller function.
 *
 * This router gets mounted under a prefix (e.g. "/api/auth") in app.ts —
 * don't hardcode "/api/auth" into these paths, just each route's own
 * suffix ("/login", not "/api/auth/login").
 */
