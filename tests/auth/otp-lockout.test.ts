import { describe, expect, it } from "vitest";
import { prisma } from "../../src/common/prisma";
import { createVerifiedUser, endResendCooldown, loginWithOtp, wrongOtpFor } from "../helpers/auth";
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

describe("otp counter across repeated logins", () => {
  async function wrongCodes(email: string, count: number): Promise<void> {
    const otp = lastOtpFor(email) as string;
    for (let i = 0; i < count; i += 1) {
      const res = await verifyOtp(email, wrongOtpFor(otp));
      expect(res.status).toBe(401);
    }
  }

  it("keeps the counter when re-logging in after the cooldown, so the lock still fires", async () => {
    const { email, password } = await createVerifiedUser();
    expect((await login(email, password)).status).toBe(200);
    await wrongCodes(email, 4);

    await endResendCooldown(email, 2 * 60 * 1000);
    expect((await login(email, password)).status).toBe(200);
    clearOutbox();
    await wrongCodes(email, 1);

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.otpLockedUntil).not.toBeNull();
    expect(outbox.map((mail) => mail.subject)).toEqual(["Unusual login activity"]);
  });

  it("resets the counter when the last code is older than the lock window", async () => {
    const { email, password } = await createVerifiedUser();
    expect((await login(email, password)).status).toBe(200);
    await wrongCodes(email, 4);

    await endResendCooldown(email, 16 * 60 * 1000);
    expect((await login(email, password)).status).toBe(200);
    await wrongCodes(email, 4);

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.otpLockedUntil).toBeNull();
    expect(user.otpAttempts).toBe(4);
  });

  it("sends one code for repeated logins within the cooldown and keeps it valid", async () => {
    const { email, password } = await createVerifiedUser();
    clearOutbox();

    const responses = [];
    for (let i = 0; i < 5; i += 1) {
      responses.push(await login(email, password));
    }

    for (const res of responses) {
      expect(res.status).toBe(200);
      expect(bodyOf<{ otpRequired: boolean }>(res).otpRequired).toBe(true);
    }
    for (const res of responses.slice(1)) {
      const { resendAfterSeconds } = bodyOf<{ resendAfterSeconds: number }>(res);
      expect(resendAfterSeconds).toBeGreaterThanOrEqual(1);
      expect(resendAfterSeconds).toBeLessThanOrEqual(60);
    }
    expect(outbox.filter((mail) => mail.subject === "Your login code")).toHaveLength(1);

    const verify = await verifyOtp(email, lastOtpFor(email) as string);
    expect(verify.status).toBe(200);
  });
});
