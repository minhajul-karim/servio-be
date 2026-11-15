import { Request, Response } from "express";
import { BodyRequest, QueryRequest } from "../../common/types/request";
import { AppError } from "../../common/errors/app-error";
import * as authService from "./auth.service";
import {
  RegisterInput,
  LoginInput,
  RefreshInput,
  LogoutInput,
  VerifyEmailInput,
  VerifyOtpInput,
  ResendOtpInput,
  ResendVerificationInput,
  ForgotPasswordInput,
  ResetPasswordInput,
  ChangePasswordInput,
} from "./auth.schema";

export async function register(req: BodyRequest<RegisterInput>, res: Response): Promise<void> {
  const user = await authService.register(req.body);
  res.status(201).json(user);
}

export async function login(req: BodyRequest<LoginInput>, res: Response): Promise<void> {
  const result = await authService.login(req.body);
  res.status(200).json(result);
}

export async function resendOtp(req: BodyRequest<ResendOtpInput>, res: Response): Promise<void> {
  const result = await authService.resendOtp(req.body);
  res.status(200).json(result);
}

export async function verifyOtp(req: BodyRequest<VerifyOtpInput>, res: Response): Promise<void> {
  const { accessToken, refreshToken } = await authService.verifyOtp(req.body);
  res.status(200).json({ accessToken, refreshToken });
}

export async function verify(req: QueryRequest<VerifyEmailInput>, res: Response): Promise<void> {
  await authService.verifyEmail(req.query);
  res.status(200).json({ success: true });
}

export async function resendVerificationEmail(
  req: BodyRequest<ResendVerificationInput>,
  res: Response,
): Promise<void> {
  const result = await authService.resendVerificationEmail(req.body);
  res.status(200).json({
    message: "If that account exists and is unverified, a new verification link has been sent",
    ...result,
  });
}

export async function refresh(req: BodyRequest<RefreshInput>, res: Response): Promise<void> {
  const { accessToken, refreshToken } = await authService.refresh(req.body);
  res.status(200).json({ accessToken, refreshToken });
}

export async function logout(req: BodyRequest<LogoutInput>, res: Response): Promise<void> {
  await authService.logout(req.body);
  res.status(204).send();
}

export async function forgotPassword(
  req: BodyRequest<ForgotPasswordInput>,
  res: Response,
): Promise<void> {
  await authService.forgotPassword(req.body);
  res
    .status(200)
    .json({ message: "If an account exists for that email, a reset link has been sent" });
}

export async function resetPassword(
  req: BodyRequest<ResetPasswordInput>,
  res: Response,
): Promise<void> {
  await authService.resetPassword(req.body);
  res.status(200).json({ success: true });
}

export async function changePassword(
  req: BodyRequest<ChangePasswordInput>,
  res: Response,
): Promise<void> {
  if (!req.user) {
    throw new AppError(401, "Unauthorized");
  }
  await authService.changePassword(req.user.userId, req.body);
  res.status(200).json({ success: true });
}

export async function me(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    throw new AppError(401, "Unauthorized");
  }
  const user = await authService.getMe(req.user.userId);
  res.status(200).json(user);
}
