import { Request, Response } from "express";
import * as authService from "./auth.service";
import {
  RegisterInput,
  LoginInput,
  RefreshInput,
  LogoutInput,
  VerifyEmailInput,
  VerifyOtpInput,
} from "./auth.schema";

export async function register(req: Request<{}, {}, RegisterInput>, res: Response): Promise<void> {
  const user = await authService.register(req.body);
  res.status(201).json({ ...user, passwordHash: undefined });
}

export async function login(req: Request<{}, {}, LoginInput>, res: Response): Promise<void> {
  const result = await authService.login(req.body);
  res.status(200).json(result);
}

export async function verifyOtp(req: Request<{}, {}, VerifyOtpInput>, res: Response): Promise<void> {
  const { accessToken, refreshToken } = await authService.verifyOtp(req.body);
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

export async function logout(req: Request<{}, {}, LogoutInput>, res: Response): Promise<void> {
  await authService.logout(req.body);
  res.status(204).send();
}
