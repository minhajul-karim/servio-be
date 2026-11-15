import { describe, expect, it, vi } from "vitest";
import { prisma } from "../../src/common/prisma";
import { createVerifiedUser, endResendCooldown, wrongOtpFor } from "../helpers/auth";
import { clearOutbox, lastOtpFor, outbox, setSendingFails } from "../helpers/mailer";
import { api, bodyOf } from "../helpers/request";

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
    expect(user.otpExpiresAt).toBeNull();
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
});
