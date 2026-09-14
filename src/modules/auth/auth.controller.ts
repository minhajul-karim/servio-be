import { Request, Response } from "express";
import * as authService from "./auth.service";
import { RegisterInput, LoginInput, RefreshInput, VerifyEmailInput } from "./auth.schema";

export async function register(req: Request<{}, {}, RegisterInput>, res: Response): Promise<void> {
  const user = await authService.register(req.body);
  res.status(201).json({ ...user, passwordHash: undefined });
}

export async function login(req: Request<{}, {}, LoginInput>, res: Response): Promise<void> {
  const { accessToken, refreshToken } = await authService.login(req.body);
  res.status(200).json({ accessToken, refreshToken });
}

export async function verify(
  req: Request<{}, {}, {}, VerifyEmailInput>,
  res: Response,
): Promise<void> {
  await authService.verifyEmail(req.query);
  res.status(200).json({ success: true });
}

export async function refresh(req: Request<{}, {}, RefreshInput>, res: Response): Promise<void> {
  const { accessToken, refreshToken } = await authService.refresh(req.body);
  res.status(200).json({ accessToken, refreshToken });
}

/**
 * TODO: implement logout.
 *
 * logout(req, res, next):
 *   await authService.logout(req.body);
 *   res.status(204).send();
 *   // 204 No Content fits here — logout doesn't need to return a body
 *
 * Because Express 5 forwards errors thrown inside async handlers to
 * error-handler.ts automatically, none of these need their own try/catch —
 * letting a thrown AppError from auth.service.ts propagate is enough.
 */
