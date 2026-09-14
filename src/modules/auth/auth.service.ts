import { prisma } from "../../common/prisma";
import { AppError } from "../../common/errors/app-error";
import { hashPassword, comparePassword } from "../../common/utils/password";
import { signToken } from "../../common/utils/jwt";
import { sendMail } from "../../common/utils/mailer";
import { env } from "../../env";

import { generateToken, hashToken } from "../../common/utils/token";
import {
  RegisterInput,
  LoginInput,
  RefreshInput,
  LogoutInput,
  VerifyEmailInput,
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

export async function login(input: LoginInput) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user) {
    throw new AppError(401, "Invalid email or password");
  }

  const isPasswordValid = await comparePassword(input.password, user.passwordHash);
  if (!isPasswordValid) {
    throw new AppError(401, "Invalid email or password");
  }

  const accessToken = signToken({ userId: user.id, role: user.role });

  const refreshToken = generateToken();
  const tokenHash = hashToken(refreshToken);
  const expiresAt = new Date(Date.now() + (input.rememberMe ? THIRTY_DAYS_IN_MS : ONE_DAY_IN_MS));

  await prisma.session.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt,
    },
  });

  return { accessToken, refreshToken };
}

export async function refresh(input: RefreshInput) {
  const tokenHashInput = hashToken(input.refreshToken);
  const session = await prisma.session.findUnique({
    where: { tokenHash: tokenHashInput },
    include: { user: true }
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
  }
}

/**
 * TODO: implement auth business logic.
 *
 * Purpose: this is where the actual "what does registering/logging in/
 * refreshing/logging out mean" logic lives — independent of Express
 * req/res, so it's easy to reason about (and later, test) without spinning
 * up an HTTP request. The controller's job is just to call these functions
 * and shape the response; this file's job is the real work.
 *
 * refresh(input: RefreshInput):
 *   1. hash the incoming token: const tokenHash = hashToken(input.refreshToken)
 *   2. look up the session, pulling the related user along with it:
 *      const session = await prisma.session.findUnique({
 *        where: { tokenHash },
 *        include: { user: true },
 *      })
 *      (the include is what gives you role for the new access token,
 *      without a second query)
 *   3. if !session or session.expiresAt < new Date(), throw
 *      new AppError(401, "Invalid or expired refresh token")
 *   4. rotate: delete the old session row —
 *      await prisma.session.delete({ where: { id: session.id } })
 *   5. mint a brand-new access token AND a brand-new refresh token, exactly
 *      like steps 3-4 of login() above (reuse session.user.id / .role,
 *      and session.expiresAt to preserve the original rememberMe duration
 *      rather than resetting it — your call whether to preserve or reset it,
 *      just be deliberate about it)
 *   6. return { accessToken, refreshToken } (the NEW pair)
 *
 * logout(input: RefreshInput or a dedicated LogoutInput — see auth.schema.ts):
 *   1. hash the incoming token: const tokenHash = hashToken(input.refreshToken)
 *   2. await prisma.session.deleteMany({ where: { tokenHash } })
 *      deleteMany (not delete) on purpose — logging out twice, or with an
 *      already-expired/already-rotated token, should just no-op rather than
 *      throw a "not found" error
 *   3. nothing meaningful to return — the controller can just send a 204 or
 *      a simple { success: true }
 *
 * You'll need the Prisma client — import it from common/prisma.ts (the
 * shared singleton), not a new PrismaClient() in this file.
 */
