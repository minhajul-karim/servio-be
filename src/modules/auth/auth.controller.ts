/**
 * TODO: implement the auth controller.
 *
 * Purpose: translates HTTP in and out — reads req.body, calls the service,
 * shapes the response. No business logic belongs here; that's
 * auth.service.ts's job. Think of this like a component that calls a hook
 * and renders whatever it gets back — it doesn't decide the data, just
 * wires it to the request/response cycle.
 *
 * register(req, res, next):
 *   const user = await authService.register(req.body);
 *   res.status(201).json({ ...user, passwordHash: undefined });
 *   // or: destructure passwordHash out before sending, whichever reads
 *   // clearer to you — the point is it must not reach the client.
 *
 * login(req, res, next):
 *   const { accessToken, refreshToken } = await authService.login(req.body);
 *   res.status(200).json({ accessToken, refreshToken });
 *
 * refresh(req, res, next):
 *   const { accessToken, refreshToken } = await authService.refresh(req.body);
 *   res.status(200).json({ accessToken, refreshToken });
 *   // note this returns a NEW refresh token every time — the client must
 *   // overwrite whatever it had stored with this new one, since the old
 *   // one was just invalidated by rotation in auth.service.ts
 *
 * logout(req, res, next):
 *   await authService.logout(req.body);
 *   res.status(204).send();
 *   // 204 No Content fits here — logout doesn't need to return a body
 *
 * Because Express 5 forwards errors thrown inside async handlers to
 * error-handler.ts automatically, none of these need their own try/catch —
 * letting a thrown AppError from auth.service.ts propagate is enough. A
 * try/catch calling next(err) explicitly also works if you prefer it to be
 * visible in the code.
 *
 * req.body arrives already validated and parsed by this point (validate()
 * runs before each handler in auth.routes.ts) — each function here can
 * trust its shape matches the corresponding *Input type from auth.schema.ts.
 */
