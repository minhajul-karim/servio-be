import { prisma } from "../../common/prisma";
import { AppError } from "../../common/errors/app-error";
import { hashPassword, comparePassword } from "../../common/utils/password";
import { signToken } from "../../common/utils/jwt";
import { sendMail } from "../../common/utils/mailer";
import { env } from "../../env";
import { Role } from "../../generated/prisma/enums";

import { generateToken, hashToken, generateOtp } from "../../common/utils/token";
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
} from "./auth.schema";

export async function register(input: RegisterInput) {
  const userExist = await prisma.user.findUnique({ where: { email: input.email } });
  if (userExist) {
    throw new AppError(409, "Email already in use");
  }

  const passwordHash = await hashPassword(input.password);
  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash,
      name: input.name,
      role: "CUSTOMER",
      emailVerified: false,
    },
  });

  await sendVerificationEmail(user.id, user.email);

  return user;
}

async function sendVerificationEmail(userId: string, email: string): Promise<void> {
  await prisma.emailVerificationToken.deleteMany({ where: { userId } });
  const rawToken = generateToken();
  const tokenHash = hashToken(rawToken);
  await prisma.emailVerificationToken.create({
    data: {
      userId,
      tokenHash,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });
  const verificationLink = `${env.FRONTEND_URL}/verify-email?token=${rawToken}`;

  try {
    await sendMail(
      email,
      "Verify your email",
      `<p>Click the link below to verify your account:</p><p><a href="${verificationLink}">${verificationLink}</a></p><p>This link expires in 24 hours.</p>`,
    );
  } catch (err) {
    console.error("Failed to send verification email:", err);
  }
}

export async function verifyEmail(input: VerifyEmailInput) {
  const tokenHash = hashToken(input.token);
  const token = await prisma.emailVerificationToken.findUnique({
    where: { tokenHash },
  });

  if (!token || token.expiresAt < new Date()) {
    throw new AppError(400, "Invalid or expired verification link");
  }

  await Promise.all([
    prisma.user.update({
      where: { id: token.userId },
      data: { emailVerified: true },
    }),
    prisma.emailVerificationToken.delete({
      where: { id: token.id },
    }),
  ]);
}

const ONE_DAY_IN_MS = 24 * 60 * 60 * 1000;
const THIRTY_DAYS_IN_MS = 30 * ONE_DAY_IN_MS;

const PASSWORD_RESET_EXPIRY_IN_MS = 60 * 60 * 1000;

const OTP_EXPIRY_IN_MS = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_IN_MS = 60 * 1000;
const RESEND_COOLDOWN_IN_SECONDS = RESEND_COOLDOWN_IN_MS / 1000;

async function createSession(userId: string, role: Role, rememberMe: boolean) {
  const accessToken = signToken({ userId, role });

  const refreshToken = generateToken();
  const tokenHash = hashToken(refreshToken);
  const expiresAt = new Date(Date.now() + (rememberMe ? THIRTY_DAYS_IN_MS : ONE_DAY_IN_MS));

  await prisma.session.create({ data: { userId, tokenHash, expiresAt } });

  return { accessToken, refreshToken };
}

function clearOtp(userId: string) {
  return prisma.user.update({
    where: { id: userId },
    data: { otpCode: null, otpExpiresAt: null, otpAttempts: 0 },
  });
}

async function verifyCredentials(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new AppError(401, "Invalid email or password");
  }

  const isPasswordValid = await comparePassword(password, user.passwordHash);
  if (!isPasswordValid) {
    throw new AppError(401, "Invalid email or password");
  }

  return user;
}

async function issueLoginOtp(userId: string, email: string, resetAttempts: boolean): Promise<void> {
  const otp = generateOtp();
  await prisma.user.update({
    where: { id: userId },
    data: {
      otpCode: hashToken(otp),
      otpExpiresAt: new Date(Date.now() + OTP_EXPIRY_IN_MS),
      ...(resetAttempts && { otpAttempts: 0 }),
    },
  });

  await sendMail(
    email,
    "Your login code",
    `<p>Your login code is:</p><p style="font-size:24px;letter-spacing:4px"><strong>${otp}</strong></p><p>This code expires in 10 minutes. If you didn't try to log in, you can ignore this email.</p>`,
  );
}

export async function login(input: LoginInput) {
  const user = await verifyCredentials(input.email, input.password);
  if (!user.emailVerified) {
    throw new AppError(
      403,
      "Please verify your email before logging in",
      undefined,
      "EMAIL_NOT_VERIFIED",
    );
  }

  await issueLoginOtp(user.id, user.email, true);
  return { otpRequired: true, resendAfterSeconds: RESEND_COOLDOWN_IN_SECONDS };
}

export async function resendOtp(input: ResendOtpInput) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user || !user.otpCode || !user.otpExpiresAt) {
    throw new AppError(400, "No pending login. Please log in again");
  }

  const otpSentAt = user.otpExpiresAt.getTime() - OTP_EXPIRY_IN_MS;
  const isCooldownActive = Date.now() - otpSentAt < RESEND_COOLDOWN_IN_MS;
  if (isCooldownActive) {
    throw new AppError(429, "Please wait before requesting a new code");
  }

  // attempts are not reset, otherwise resending would allow unlimited guesses without the password
  await issueLoginOtp(user.id, user.email, false);
  return { resendAfterSeconds: RESEND_COOLDOWN_IN_SECONDS };
}

export async function resendVerificationEmail(input: ResendVerificationInput) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (user && !user.emailVerified) {
    const latestVerificationToken = await prisma.emailVerificationToken.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });
    const verificationEmailSentAt = latestVerificationToken?.createdAt.getTime();
    const isCooldownActive =
      verificationEmailSentAt !== undefined &&
      Date.now() - verificationEmailSentAt < RESEND_COOLDOWN_IN_MS;
    if (!isCooldownActive) {
      await sendVerificationEmail(user.id, user.email);
    }
  }

  return { resendAfterSeconds: RESEND_COOLDOWN_IN_SECONDS };
}

export async function verifyOtp(input: VerifyOtpInput) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user || !user.otpCode || !user.otpExpiresAt || user.otpExpiresAt < new Date()) {
    throw new AppError(401, "Invalid or expired code");
  }

  const { otpAttempts } = await prisma.user.update({
    where: { id: user.id },
    data: { otpAttempts: { increment: 1 } },
    select: { otpAttempts: true },
  });

  if (otpAttempts > OTP_MAX_ATTEMPTS) {
    await clearOtp(user.id);
    throw new AppError(401, "Invalid or expired code");
  }

  if (hashToken(input.otp) !== user.otpCode) {
    if (otpAttempts >= OTP_MAX_ATTEMPTS) {
      await clearOtp(user.id);
    }
    throw new AppError(401, "Invalid or expired code");
  }

  await clearOtp(user.id);

  return createSession(user.id, user.role, input.rememberMe);
}

export async function refresh(input: RefreshInput) {
  const tokenHashInput = hashToken(input.refreshToken);
  const session = await prisma.session.findUnique({
    where: { tokenHash: tokenHashInput },
    include: { user: true },
  });

  if (!session || session.expiresAt < new Date()) {
    throw new AppError(401, "Invalid or expired refresh token");
  }

  await prisma.session.delete({ where: { id: session.id } });

  const accessToken = signToken({ userId: session.user.id, role: session.user.role });
  const refreshToken = generateToken();
  const tokenHash = hashToken(refreshToken);
  const durationMs = session.expiresAt.getTime() - session.createdAt.getTime();
  const expiresAt = new Date(Date.now() + durationMs);

  await prisma.session.create({
    data: {
      userId: session.user.id,
      tokenHash,
      expiresAt,
    },
  });

  return {
    accessToken,
    refreshToken,
  };
}

export async function logout(input: LogoutInput) {
  const tokenHash = hashToken(input.refreshToken);
  await prisma.session.deleteMany({ where: { tokenHash } });
}

export async function forgotPassword(input: ForgotPasswordInput): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user) {
    return;
  }

  await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });
  const rawToken = generateToken();
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + PASSWORD_RESET_EXPIRY_IN_MS),
    },
  });

  const resetLink = `${env.FRONTEND_URL}/reset-password?token=${rawToken}`;

  try {
    await sendMail(
      user.email,
      "Reset your password",
      `<p>Click the link below to reset your password:</p><p><a href="${resetLink}">${resetLink}</a></p><p>This link expires in 1 hour. If you didn't request this, you can ignore this email.</p>`,
    );
  } catch (err) {
    console.error("Failed to send password reset email:", err);
  }
}

export async function resetPassword(input: ResetPasswordInput): Promise<void> {
  const resetToken = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(input.token) },
  });

  if (!resetToken || resetToken.expiresAt < new Date()) {
    throw new AppError(400, "Invalid or expired reset link");
  }

  const passwordHash = await hashPassword(input.password);

  await prisma.$transaction(async (tx) => {
    const claimed = await tx.passwordResetToken.deleteMany({
      where: { id: resetToken.id },
    });

    if (claimed.count === 0) {
      throw new AppError(400, "Invalid or expired reset link");
    }

    await tx.user.update({
      where: { id: resetToken.userId },
      data: { passwordHash, otpCode: null, otpExpiresAt: null, otpAttempts: 0 },
    });
    await tx.session.deleteMany({ where: { userId: resetToken.userId } });
  });
}
