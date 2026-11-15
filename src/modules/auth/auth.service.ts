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
  ChangePasswordInput,
} from "./auth.schema";

const ONE_DAY_IN_MS = 24 * 60 * 60 * 1000;
const THIRTY_DAYS_IN_MS = 30 * ONE_DAY_IN_MS;

const PASSWORD_RESET_EXPIRY_IN_MS = 60 * 60 * 1000;

const OTP_EXPIRY_IN_MS = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_LOCK_IN_MS = 15 * 60 * 1000;
const RESEND_COOLDOWN_IN_MS = 60 * 1000;
const RESEND_COOLDOWN_IN_SECONDS = RESEND_COOLDOWN_IN_MS / 1000;

const CLEARED_OTP_FIELDS = { otpCode: null, otpExpiresAt: null, otpAttempts: 0 } as const;

const publicUserSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  emailVerified: true,
  selectedRestaurantId: true,
} as const;

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
    select: publicUserSelect,
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
      expiresAt: new Date(Date.now() + ONE_DAY_IN_MS),
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

  await prisma.$transaction(async (tx) => {
    const claimed = await tx.emailVerificationToken.deleteMany({
      where: { id: token.id },
    });

    if (claimed.count === 0) {
      throw new AppError(400, "Invalid or expired verification link");
    }

    await tx.user.update({
      where: { id: token.userId },
      data: { emailVerified: true },
    });
  });
}

async function createSession(
  userId: string,
  role: Role,
  lifetime: number | Date,
  db: Pick<typeof prisma, "session"> = prisma,
) {
  const accessToken = signToken({ userId, role });

  const refreshToken = generateToken();
  const tokenHash = hashToken(refreshToken);
  const expiresAt = lifetime instanceof Date ? lifetime : new Date(Date.now() + lifetime);

  await db.session.create({ data: { userId, tokenHash, expiresAt } });

  return { accessToken, refreshToken };
}

async function lockOtp(userId: string, email: string): Promise<void> {
  const now = new Date();
  const locked = await prisma.user.updateMany({
    where: {
      id: userId,
      OR: [{ otpLockedUntil: null }, { otpLockedUntil: { lte: now } }],
    },
    data: { ...CLEARED_OTP_FIELDS, otpLockedUntil: new Date(now.getTime() + OTP_LOCK_IN_MS) },
  });

  if (locked.count === 0) {
    await prisma.user.update({ where: { id: userId }, data: CLEARED_OTP_FIELDS });
    return;
  }

  const resetLink = `${env.FRONTEND_URL}/forgot-password`;

  try {
    await sendMail(
      email,
      "Unusual login activity",
      `<p>Someone entered 5 wrong login codes for your account, so new logins are paused for 15 minutes.</p><p>If this wasn't you, reset your password:</p><p><a href="${resetLink}">${resetLink}</a></p>`,
    );
  } catch (err) {
    console.error("Failed to send OTP lock email:", err);
  }
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

function lastOtpSentAt(user: { otpExpiresAt: Date | null }): Date | null {
  return user.otpExpiresAt ? new Date(user.otpExpiresAt.getTime() - OTP_EXPIRY_IN_MS) : null;
}

function cooldownRemainingMs(sentAt: Date): number {
  return Math.max(0, RESEND_COOLDOWN_IN_MS - (Date.now() - sentAt.getTime()));
}

async function issueLoginOtp(
  userId: string,
  email: string,
  resetAttempts: boolean,
): Promise<boolean> {
  const otp = generateOtp();
  const hashedOtp = hashToken(otp);
  const now = Date.now();
  const claimed = await prisma.user.updateMany({
    where: {
      id: userId,
      OR: [
        { otpExpiresAt: null },
        { otpExpiresAt: { lte: new Date(now + OTP_EXPIRY_IN_MS - RESEND_COOLDOWN_IN_MS) } },
      ],
    },
    data: {
      otpCode: hashedOtp,
      otpExpiresAt: new Date(now + OTP_EXPIRY_IN_MS),
      ...(resetAttempts && { otpAttempts: 0 }),
    },
  });

  if (claimed.count === 0) {
    return false;
  }

  try {
    await sendMail(
      email,
      "Your login code",
      `<p>Your login code is:</p><p style="font-size:24px;letter-spacing:4px"><strong>${otp}</strong></p><p>This code expires in 10 minutes. If you didn't try to log in, you can ignore this email.</p>`,
    );
  } catch (error) {
    console.error("Failed to send login code email", error);

    try {
      await prisma.user.updateMany({
        where: { id: userId, otpCode: hashedOtp },
        // backdated to exactly one cooldown ago so a retry is allowed at once and otpAttempts is not treated as stale
        data: {
          otpCode: null,
          otpExpiresAt: new Date(Date.now() - RESEND_COOLDOWN_IN_MS + OTP_EXPIRY_IN_MS),
        },
      });
    } catch (cleanupError) {
      console.error("Failed to clear login code after email failure", cleanupError);
    }

    throw new AppError(
      503,
      "Could not send the login code. Please try again",
      undefined,
      "EMAIL_SEND_FAILED",
    );
  }

  return true;
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

  if (user.otpLockedUntil && user.otpLockedUntil > new Date()) {
    const retryAfterSeconds = Math.ceil((user.otpLockedUntil.getTime() - Date.now()) / 1000);
    throw new AppError(
      429,
      "Too many wrong codes. Try again later",
      undefined,
      "OTP_LOCKED",
      retryAfterSeconds,
    );
  }

  const lastSentAt = lastOtpSentAt(user);
  const cooldownMs = lastSentAt ? cooldownRemainingMs(lastSentAt) : 0;

  if (cooldownMs > 0) {
    return { otpRequired: true, resendAfterSeconds: Math.max(1, Math.ceil(cooldownMs / 1000)) };
  }

  const isStaleCounter = lastSentAt === null || Date.now() - lastSentAt.getTime() >= OTP_LOCK_IN_MS;
  const sent = await issueLoginOtp(user.id, user.email, isStaleCounter);
  if (!sent) {
    const latest = await prisma.user.findUnique({
      where: { id: user.id },
      select: { otpExpiresAt: true },
    });
    const latestSentAt = latest ? lastOtpSentAt(latest) : null;
    const remainingMs = latestSentAt ? cooldownRemainingMs(latestSentAt) : 0;
    return { otpRequired: true, resendAfterSeconds: Math.max(1, Math.ceil(remainingMs / 1000)) };
  }

  return { otpRequired: true, resendAfterSeconds: RESEND_COOLDOWN_IN_SECONDS };
}

export async function resendOtp(input: ResendOtpInput) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user || !user.otpCode || !user.otpExpiresAt || user.otpExpiresAt < new Date()) {
    throw new AppError(400, "No pending login. Please log in again");
  }

  const otpSentAt = lastOtpSentAt(user) as Date;
  if (cooldownRemainingMs(otpSentAt) > 0) {
    throw new AppError(429, "Please wait before requesting a new code");
  }

  // attempts are not reset, otherwise resending would allow unlimited guesses without the password
  const sent = await issueLoginOtp(user.id, user.email, false);
  if (!sent) {
    throw new AppError(429, "Please wait before requesting a new code");
  }

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
    await lockOtp(user.id, user.email);
    throw new AppError(401, "Invalid or expired code");
  }

  if (hashToken(input.otp) !== user.otpCode) {
    if (otpAttempts >= OTP_MAX_ATTEMPTS) {
      await lockOtp(user.id, user.email);
    }
    throw new AppError(401, "Invalid or expired code");
  }

  const claimed = await prisma.user.updateMany({
    where: { id: user.id, otpCode: user.otpCode },
    data: { ...CLEARED_OTP_FIELDS, otpLockedUntil: null },
  });

  if (claimed.count === 0) {
    throw new AppError(401, "Invalid or expired code");
  }

  return createSession(user.id, user.role, input.rememberMe ? THIRTY_DAYS_IN_MS : ONE_DAY_IN_MS);
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

  return prisma.$transaction(async (tx) => {
    const claimed = await tx.session.deleteMany({ where: { id: session.id } });

    if (claimed.count === 0) {
      throw new AppError(401, "Invalid or expired refresh token");
    }

    return createSession(session.user.id, session.user.role, session.expiresAt, tx);
  });
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
      data: { passwordHash, emailVerified: true, ...CLEARED_OTP_FIELDS, otpLockedUntil: null },
    });
    await tx.session.deleteMany({ where: { userId: resetToken.userId } });
  });
}

export async function changePassword(userId: string, input: ChangePasswordInput): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new AppError(401, "User not found");
  }

  const isCurrentPasswordValid = await comparePassword(input.currentPassword, user.passwordHash);
  if (!isCurrentPasswordValid) {
    throw new AppError(400, "Current password is incorrect", undefined, "INVALID_CURRENT_PASSWORD");
  }

  const isSamePassword = await comparePassword(input.newPassword, user.passwordHash);
  if (isSamePassword) {
    throw new AppError(
      400,
      "New password must be different from the current one",
      undefined,
      "SAME_PASSWORD",
    );
  }

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(input.refreshToken) },
  });
  if (!session || session.userId !== userId || session.expiresAt < new Date()) {
    throw new AppError(400, "Invalid refresh token", undefined, "INVALID_REFRESH_TOKEN");
  }

  const passwordHash = await hashPassword(input.newPassword);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { passwordHash, ...CLEARED_OTP_FIELDS, otpLockedUntil: null },
    });
    await tx.passwordResetToken.deleteMany({ where: { userId } });
    await tx.session.deleteMany({ where: { userId, id: { not: session.id } } });
  });
}

export async function getMe(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: publicUserSelect });
  if (!user) {
    throw new AppError(401, "User not found");
  }
  return user;
}
