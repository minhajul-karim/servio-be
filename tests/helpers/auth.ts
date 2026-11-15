import { prisma } from "../../src/common/prisma";
import { lastLinkFor, lastOtpFor, tokenFromLink } from "./mailer";
import { api, bodyOf } from "./request";

const COOLDOWN_SHIFT_IN_MS = 61 * 1000;

function expectStatus(step: string, res: { status: number; body: unknown }, expected: number) {
  if (res.status !== expected) {
    throw new Error(
      `${step} failed: expected ${expected}, got ${res.status} ${JSON.stringify(res.body)}`,
    );
  }
}

let counter = 0;

interface RegisterOptions {
  email?: string;
  password?: string;
  name?: string;
}

export interface Credentials {
  email: string;
  password: string;
}

export interface Tokens {
  accessToken: string;
  refreshToken: string;
}

export async function registerUser(options: RegisterOptions = {}) {
  counter += 1;
  const email = options.email ?? `user${counter}-${Date.now()}@example.com`;
  const password = options.password ?? "password123";
  const name = options.name ?? "Test User";
  const res = await api().post("/api/auth/register").send({ email, password, name });

  return { res, body: bodyOf(res), email, password };
}

export async function createVerifiedUser(options: RegisterOptions = {}) {
  const { res, email, password } = await registerUser(options);
  expectStatus("register", res, 201);
  const link = lastLinkFor(email) as string;
  const token = tokenFromLink(link) as string;
  const verifyRes = await api().get("/api/auth/verify-email").query({ token });
  expectStatus("verify-email", verifyRes, 200);

  return { email, password, id: bodyOf<{ id: string }>(res).id };
}

export function wrongOtpFor(otp: string): string {
  return otp === "000000" ? "111111" : "000000";
}

export async function loginWithOtp(
  email: string,
  password: string,
  { rememberMe }: { rememberMe?: boolean } = {},
): Promise<Tokens> {
  const loginRes = await api().post("/api/auth/login").send({ email, password });
  expectStatus("login", loginRes, 200);
  const otp = lastOtpFor(email) as string;
  const res = await api().post("/api/auth/verify-otp").send({ email, otp, rememberMe });
  expectStatus("verify-otp", res, 200);

  return bodyOf<Tokens>(res);
}

export async function endResendCooldown(
  email: string,
  ms = COOLDOWN_SHIFT_IN_MS,
): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  if (!user.otpExpiresAt) {
    throw new Error("User has no pending OTP");
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { otpExpiresAt: new Date(user.otpExpiresAt.getTime() - ms) },
  });
}

export async function endVerificationCooldown(email: string): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const token = await prisma.emailVerificationToken.findFirstOrThrow({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });

  await prisma.emailVerificationToken.update({
    where: { id: token.id },
    data: { createdAt: new Date(token.createdAt.getTime() - COOLDOWN_SHIFT_IN_MS) },
  });
}
