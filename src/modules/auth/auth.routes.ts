/**
 * TODO: implement the auth router.
 *
 * Purpose: the ONLY place that maps a URL + HTTP method to a controller
 * function (plus whichever middleware runs first) — no logic here, just
 * wiring. Think of this like a router config file (e.g. React Router's
 * route table): it says WHERE things are, not WHAT they do.
 *
 * First route needed:
 *
 *   import { Router } from "express";
 *   import { validate } from "../../common/middlewares/validate";
 *   import { registerSchema } from "./auth.schema";
 *   import * as authController from "./auth.controller";
 *
 *   const router = Router();
 *
 *   router.post("/register", validate(registerSchema), authController.register);
 *
 *   export default router;
 *
 * This is a public route — no requireAuth here, since a not-yet-registered
 * user obviously can't present a token yet.
 *
 * Later routes (login, verify-otp, forgot-password, reset-password) get
 * added here the same way, one line each — each with its own schema from
 * auth.schema.ts and its own controller function.
 *
 * This router gets mounted under a prefix (e.g. "/api/auth") in app.ts —
 * don't hardcode "/api/auth" into these paths, just the route's own suffix
 * ("/register", not "/api/auth/register").
 */
