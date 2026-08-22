/**
 * TODO: implement the auth controller.
 *
 * Purpose: translates HTTP in and out — reads req.body, calls the service,
 * shapes the response. No business logic belongs here; that's
 * auth.service.ts's job. Think of this like a component that calls a hook
 * and renders whatever it gets back — it doesn't decide the data, just
 * wires it to the request/response cycle.
 *
 * First handler needed — register:
 *
 *   async function register(req, res, next) {
 *     const user = await authService.register(req.body);
 *     res.status(201).json({ ...user, passwordHash: undefined });
 *     // or: destructure passwordHash out before sending, whichever reads
 *     // clearer to you — the point is it must not reach the client.
 *   }
 *
 * Because Express 5 forwards errors thrown inside async handlers to
 * error-handler.ts automatically, you don't strictly need a try/catch here —
 * letting authService.register's thrown AppError propagate is enough. A
 * try/catch calling next(err) explicitly also works if you prefer it to be
 * visible in the code.
 *
 * req.body arrives already validated and parsed by this point (validate()
 * runs before this handler in auth.routes.ts) — this function can trust its
 * shape matches RegisterInput from auth.schema.ts.
 */
