import { describe, expect, it } from "vitest";
import { prisma } from "../../src/common/prisma";
import { createVerifiedUser, loginWithOtp, wrongOtpFor } from "../helpers/auth";
import { clearOutbox, lastLinkFor, lastOtpFor, outbox } from "../helpers/mailer";
import { api, bodyOf } from "../helpers/request";

const LOCK_IN_SECONDS = 15 * 60;

function login(email: string, password: string) {
  return api().post("/api/auth/login").send({ email, password });
}

function verifyOtp(email: string, otp: string) {
  return api().post("/api/auth/verify-otp").send({ email, otp });
}

async function lockAccount(email: string, password: string): Promise<void> {
  const res = await login(email, password);
  expect(res.status).toBe(200);
  const otp = lastOtpFor(email) as string;

  for (let i = 0; i < 5; i += 1) {
    const wrong = await verifyOtp(email, wrongOtpFor(otp));
    expect(wrong.status).toBe(401);
  }
}

describe("otp lockout", () => {
  it("locks the account and sends exactly one lock email after 5 wrong codes", async () => {
    const { email, password } = await createVerifiedUser();
    const res = await login(email, password);
    expect(res.status).toBe(200);
    const otp = lastOtpFor(email) as string;
    clearOutbox();

    for (let i = 0; i < 5; i += 1) {
      await verifyOtp(email, wrongOtpFor(otp));
    }
    await verifyOtp(email, wrongOtpFor(otp));

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.otpCode).toBeNull();
    expect(user.otpLockedUntil).not.toBeNull();
    const remaining = (user.otpLockedUntil as Date).getTime() - Date.now();
    expect(Math.abs(remaining - LOCK_IN_SECONDS * 1000)).toBeLessThan(60 * 1000);

    expect(outbox).toHaveLength(1);
    expect(outbox[0].to).toBe(email);
    expect(outbox[0].subject).toBe("Unusual login activity");
    expect(lastLinkFor(email)).toBe("http://localhost:3000/forgot-password");
  });

  it("returns 429 OTP_LOCKED with Retry-After for the correct password during the lock", async () => {
    const { email, password } = await createVerifiedUser();
    await lockAccount(email, password);
    clearOutbox();

    const res = await login(email, password);

    expect(res.status).toBe(429);
    const { code, retryAfterSeconds: retryAfter } = bodyOf<{
      code: string;
      retryAfterSeconds: number;
    }>(res);
    expect(code).toBe("OTP_LOCKED");
    expect(retryAfter).toBeGreaterThan(LOCK_IN_SECONDS - 60);
    expect(retryAfter).toBeLessThanOrEqual(LOCK_IN_SECONDS);
    expect(res.headers["retry-after"]).toBe(String(retryAfter));
    expect(outbox).toHaveLength(0);
  });

  it("returns the normal 401 for a wrong password during the lock", async () => {
    const { email, password } = await createVerifiedUser();
    await lockAccount(email, password);

    const locked = await login(email, "nope-nope");
    const unknown = await login("nobody@example.com", "nope-nope");

    expect(locked.status).toBe(401);
    expect(locked.body).toEqual(unknown.body);
    expect(locked.headers["retry-after"]).toBeUndefined();
  });

  it("lets login work again after the lock expires", async () => {
    const { email, password } = await createVerifiedUser();
    await lockAccount(email, password);
    await prisma.user.update({
      where: { email },
      data: { otpLockedUntil: new Date(Date.now() - 1000) },
    });

    const res = await login(email, password);
    expect(res.status).toBe(200);

    const otp = lastOtpFor(email) as string;
    const verify = await verifyOtp(email, otp);
    expect(verify.status).toBe(200);

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.otpLockedUntil).toBeNull();
  });

  it("clears the lock on reset-password", async () => {
    const { email, password } = await createVerifiedUser();
    await lockAccount(email, password);
    await api().post("/api/auth/forgot-password").send({ email });
    const token = new URL(lastLinkFor(email) as string).searchParams.get("token");

    const reset = await api()
      .post("/api/auth/reset-password")
      .send({ token, password: "brand-new-pass-1" });
    expect(reset.status).toBe(200);

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.otpLockedUntil).toBeNull();
    const tokens = await loginWithOtp(email, "brand-new-pass-1");
    expect(tokens.accessToken).toBeTruthy();
  });

  it("clears the lock on change-password", async () => {
    const { email, password } = await createVerifiedUser();
    const { refreshToken, accessToken } = await loginWithOtp(email, password);
    await prisma.user.update({
      where: { email },
      data: { otpLockedUntil: new Date(Date.now() + 60 * 1000) },
    });

    const res = await api()
      .post("/api/auth/change-password")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ currentPassword: password, newPassword: "brand-new-pass-1", refreshToken });
    expect(res.status).toBe(200);

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.otpLockedUntil).toBeNull();
  });

  it("resets the counter after a correct code", async () => {
    const { email, password } = await createVerifiedUser();
    const res = await login(email, password);
    expect(res.status).toBe(200);
    const otp = lastOtpFor(email) as string;

    for (let i = 0; i < 4; i += 1) {
      await verifyOtp(email, wrongOtpFor(otp));
    }
    const ok = await verifyOtp(email, otp);
    expect(ok.status).toBe(200);

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.otpAttempts).toBe(0);
    expect(user.otpLockedUntil).toBeNull();
  });
});
