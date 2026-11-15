import { describe, expect, it } from "vitest";
import { prisma } from "../../src/common/prisma";
import {
  type Tokens,
  createVerifiedUser,
  endResendCooldown,
  loginWithOtp,
  wrongOtpFor,
} from "../helpers/auth";
import { clearOutbox, lastOtpFor, outbox } from "../helpers/mailer";
import { api, bodyOf } from "../helpers/request";

const ONE_MINUTE_IN_MS = 60 * 1000;
const ONE_DAY_IN_MS = 24 * 60 * 60 * 1000;

async function startLogin(email: string, password: string): Promise<string> {
  const res = await api().post("/api/auth/login").send({ email, password });
  expect(res.status).toBe(200);

  return lastOtpFor(email) as string;
}

function verifyOtp(email: string, otp: string, rememberMe?: boolean) {
  return api().post("/api/auth/verify-otp").send({ email, otp, rememberMe });
}

describe("login", () => {
  it("returns identical 401 bodies for wrong password and unknown email", async () => {
    const { email } = await createVerifiedUser();

    const wrongPassword = await api()
      .post("/api/auth/login")
      .send({ email, password: "nope-nope" });
    const unknown = await api()
      .post("/api/auth/login")
      .send({ email: "nobody@example.com", password: "password123" });

    expect(wrongPassword.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrongPassword.body).toEqual(unknown.body);
  });

  it("requires an OTP and emails it for a verified user", async () => {
    const { email, password } = await createVerifiedUser();
    clearOutbox();

    const res = await api().post("/api/auth/login").send({ email, password });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ otpRequired: true, resendAfterSeconds: 60 });
    expect(outbox).toHaveLength(1);
    expect(lastOtpFor(email)).toMatch(/^\d{6}$/);
  });
});

describe("verify-otp", () => {
  it("issues tokens, creates a session and clears the OTP", async () => {
    const { email, password, id } = await createVerifiedUser();
    const otp = await startLogin(email, password);

    const res = await verifyOtp(email, otp);

    expect(res.status).toBe(200);
    const tokens = bodyOf<Tokens>(res);
    expect(tokens.accessToken).toBeTruthy();
    expect(tokens.refreshToken).toBeTruthy();
    expect(await prisma.session.count({ where: { userId: id } })).toBe(1);

    const user = await prisma.user.findUniqueOrThrow({ where: { id } });
    expect(user.otpCode).toBeNull();

    const reuse = await verifyOtp(email, otp);
    expect(reuse.status).toBe(401);
  });

  it("rejects a wrong code", async () => {
    const { email, password } = await createVerifiedUser();
    const otp = await startLogin(email, password);

    const res = await verifyOtp(email, wrongOtpFor(otp));

    expect(res.status).toBe(401);
  });

  it("rejects an expired OTP even with the correct code", async () => {
    const { email, password } = await createVerifiedUser();
    const otp = await startLogin(email, password);
    await prisma.user.update({
      where: { email },
      data: { otpExpiresAt: new Date(Date.now() - 1000) },
    });

    const res = await verifyOtp(email, otp);

    expect(res.status).toBe(401);
  });

  it("locks out after 5 wrong attempts", async () => {
    const { email, password } = await createVerifiedUser();
    const otp = await startLogin(email, password);

    for (let i = 0; i < 5; i += 1) {
      const res = await verifyOtp(email, wrongOtpFor(otp));
      expect(res.status).toBe(401);
    }

    const res = await verifyOtp(email, otp);
    expect(res.status).toBe(401);
  });

  it("sets session expiry to about 30 days with rememberMe and 1 day by default", async () => {
    const { email, password, id } = await createVerifiedUser();

    await loginWithOtp(email, password, { rememberMe: true });
    await loginWithOtp(email, password);

    const sessions = await prisma.session.findMany({
      where: { userId: id },
      orderBy: { createdAt: "asc" },
    });
    expect(sessions).toHaveLength(2);

    const remembered = sessions[0].expiresAt.getTime() - Date.now();
    const regular = sessions[1].expiresAt.getTime() - Date.now();
    expect(Math.abs(remembered - 30 * ONE_DAY_IN_MS)).toBeLessThan(ONE_MINUTE_IN_MS);
    expect(Math.abs(regular - ONE_DAY_IN_MS)).toBeLessThan(ONE_MINUTE_IN_MS);
  });
});

describe("resend-otp", () => {
  it("returns 429 within the cooldown", async () => {
    const { email, password } = await createVerifiedUser();
    await startLogin(email, password);

    const res = await api().post("/api/auth/resend-otp").send({ email });

    expect(res.status).toBe(429);
  });

  it("issues a new working code after the cooldown and invalidates the old one", async () => {
    const { email, password } = await createVerifiedUser();
    const oldOtp = await startLogin(email, password);
    await endResendCooldown(email);

    const res = await api().post("/api/auth/resend-otp").send({ email });
    expect(res.status).toBe(200);

    let newOtp = lastOtpFor(email) as string;
    if (newOtp === oldOtp) {
      await endResendCooldown(email);
      await api().post("/api/auth/resend-otp").send({ email });
      newOtp = lastOtpFor(email) as string;
    }
    expect(newOtp).not.toBe(oldOtp);

    const oldRes = await verifyOtp(email, oldOtp);
    expect(oldRes.status).toBe(401);

    const newRes = await verifyOtp(email, newOtp);
    expect(newRes.status).toBe(200);
  });

  it("keeps attempts across a resend", async () => {
    const { email, password } = await createVerifiedUser();
    const firstOtp = await startLogin(email, password);

    for (let i = 0; i < 4; i += 1) {
      const res = await verifyOtp(email, wrongOtpFor(firstOtp));
      expect(res.status).toBe(401);
    }

    await endResendCooldown(email);
    const resend = await api().post("/api/auth/resend-otp").send({ email });
    expect(resend.status).toBe(200);
    const newOtp = lastOtpFor(email) as string;

    const wrong = await verifyOtp(email, wrongOtpFor(newOtp));
    expect(wrong.status).toBe(401);

    const correct = await verifyOtp(email, newOtp);
    expect(correct.status).toBe(401);
  });

  it("returns 400 with no pending login", async () => {
    const { email } = await createVerifiedUser();

    const res = await api().post("/api/auth/resend-otp").send({ email });

    expect(res.status).toBe(400);
  });

  it("returns 400 and sends no email when the OTP has expired", async () => {
    const { email, password } = await createVerifiedUser();
    await startLogin(email, password);
    await prisma.user.update({
      where: { email },
      data: { otpExpiresAt: new Date(Date.now() - ONE_MINUTE_IN_MS) },
    });
    clearOutbox();

    const res = await api().post("/api/auth/resend-otp").send({ email });

    expect(res.status).toBe(400);
    expect(outbox).toHaveLength(0);
  });
});
