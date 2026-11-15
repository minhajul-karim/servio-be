import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../../src/common/prisma";
import { createVerifiedUser, endResendCooldown, wrongOtpFor } from "../helpers/auth";
import { clearOutbox, lastOtpFor, outbox, setOnSend, setSendingFails } from "../helpers/mailer";
import { api, bodyOf } from "../helpers/request";

afterEach(() => {
  vi.restoreAllMocks();
});

function login(email: string, password: string) {
  return api().post("/api/auth/login").send({ email, password });
}

function verifyOtp(email: string, otp: string) {
  return api().post("/api/auth/verify-otp").send({ email, otp });
}

describe("login code email failure", () => {
  it("returns 503 EMAIL_SEND_FAILED and clears the stored code", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { email, password } = await createVerifiedUser();
    setSendingFails(true);

    const res = await login(email, password);

    expect(res.status).toBe(503);
    expect(bodyOf<{ code: string }>(res).code).toBe("EMAIL_SEND_FAILED");
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.otpCode).toBeNull();
    expect(user.otpExpiresAt).not.toBeNull();
  });

  it("lets the user retry immediately without the resend cooldown", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { email, password } = await createVerifiedUser();
    setSendingFails(true);
    await login(email, password);
    setSendingFails(false);
    clearOutbox();

    const res = await login(email, password);

    expect(res.status).toBe(200);
    expect(outbox).toHaveLength(1);
    const otp = lastOtpFor(email) as string;
    const verify = await verifyOtp(email, otp);
    expect(verify.status).toBe(200);
  });

  it("does not touch otpAttempts when sending fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { email, password } = await createVerifiedUser();
    await login(email, password);
    const otp = lastOtpFor(email) as string;
    for (let i = 0; i < 2; i += 1) {
      const wrong = await verifyOtp(email, wrongOtpFor(otp));
      expect(wrong.status).toBe(401);
    }
    await endResendCooldown(email);
    setSendingFails(true);

    const res = await login(email, password);

    expect(res.status).toBe(503);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.otpAttempts).toBe(2);
  });

  it("returns 503 for resend-otp when sending fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { email, password } = await createVerifiedUser();
    await login(email, password);
    await endResendCooldown(email);
    setSendingFails(true);

    const res = await api().post("/api/auth/resend-otp").send({ email });

    expect(res.status).toBe(503);
    expect(bodyOf<{ code: string }>(res).code).toBe("EMAIL_SEND_FAILED");
  });

  it("keeps the wrong-code counter across a mail failure so the account still locks", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { email, password } = await createVerifiedUser();
    await login(email, password);
    const firstOtp = lastOtpFor(email) as string;
    for (let i = 0; i < 4; i += 1) {
      const wrong = await verifyOtp(email, wrongOtpFor(firstOtp));
      expect(wrong.status).toBe(401);
    }
    await endResendCooldown(email);
    setSendingFails(true);
    const failed = await login(email, password);
    expect(failed.status).toBe(503);
    setSendingFails(false);

    const retry = await login(email, password);

    expect(retry.status).toBe(200);
    const afterRetry = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(afterRetry.otpAttempts).toBe(4);
    const newOtp = lastOtpFor(email) as string;
    clearOutbox();
    const lastWrong = await verifyOtp(email, wrongOtpFor(newOtp));
    expect(lastWrong.status).toBe(401);
    const locked = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(locked.otpLockedUntil).not.toBeNull();
    expect((locked.otpLockedUntil as Date).getTime()).toBeGreaterThan(Date.now());
    expect(outbox).toHaveLength(1);
    expect(outbox[0].subject).toBe("Unusual login activity");
  });

  it("leaves a newer code alone when its own send fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { email, password, id } = await createVerifiedUser();
    const newerCode = "newer-code-hash";
    setSendingFails(true);
    setOnSend(async () => {
      await prisma.user.update({ where: { id }, data: { otpCode: newerCode } });
    });

    const res = await login(email, password);

    expect(res.status).toBe(503);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.otpCode).toBe(newerCode);
  });
});

describe("parallel logins", () => {
  it("sends exactly one code and both calls answer 200", async () => {
    const { email, password } = await createVerifiedUser();
    clearOutbox();

    const [a, b] = await Promise.all([login(email, password), login(email, password)]);

    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    const codeMails = outbox.filter((mail) => mail.subject === "Your login code");
    expect(codeMails).toHaveLength(1);
    const verify = await verifyOtp(email, lastOtpFor(email) as string);
    expect(verify.status).toBe(200);
  });
});
