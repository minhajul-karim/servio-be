import { describe, expect, it } from "vitest";
import { prisma } from "../../src/common/prisma";
import { createVerifiedUser, loginWithOtp, registerUser } from "../helpers/auth";
import { clearOutbox, lastLinkFor, lastOtpFor, outbox, tokenFromLink } from "../helpers/mailer";
import { api } from "../helpers/request";

const NEW_PASSWORD = "brand-new-password";

function forgot(email: string) {
  return api().post("/api/auth/forgot-password").send({ email });
}

function reset(token: string, password = NEW_PASSWORD) {
  return api().post("/api/auth/reset-password").send({ token, password });
}

async function requestToken(email: string): Promise<string> {
  const res = await forgot(email);
  expect(res.status).toBe(200);

  return tokenFromLink(lastLinkFor(email) as string) as string;
}

describe("forgot-password", () => {
  it("emails a reset link with a token for a real user", async () => {
    const { email } = await createVerifiedUser();
    clearOutbox();

    const res = await forgot(email);

    expect(res.status).toBe(200);
    expect(outbox).toHaveLength(1);
    expect(outbox[0].to).toBe(email);
    expect(lastLinkFor(email)).toContain("/reset-password?token=");
    expect(tokenFromLink(lastLinkFor(email) as string)).toBeTruthy();
  });

  it("returns an identical response and sends nothing for an unknown email", async () => {
    const { email } = await createVerifiedUser();
    clearOutbox();

    const real = await forgot(email);
    clearOutbox();
    const unknown = await forgot("nobody@example.com");

    expect(unknown.status).toBe(real.status);
    expect(unknown.body).toEqual(real.body);
    expect(outbox).toHaveLength(0);
  });

  it("replaces the previous token when requested again", async () => {
    const { email } = await createVerifiedUser();
    const first = await requestToken(email);
    const second = await requestToken(email);

    const firstRes = await reset(first);
    expect(firstRes.status).toBe(400);

    const secondRes = await reset(second);
    expect(secondRes.status).toBe(200);
  });
});

describe("reset-password", () => {
  it("changes the password", async () => {
    const { email, password } = await createVerifiedUser();
    const token = await requestToken(email);

    const res = await reset(token);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });

    const newLogin = await api().post("/api/auth/login").send({ email, password: NEW_PASSWORD });
    expect(newLogin.status).toBe(200);

    const oldLogin = await api().post("/api/auth/login").send({ email, password });
    expect(oldLogin.status).toBe(401);
  });

  it("revokes all sessions", async () => {
    const { email, password } = await createVerifiedUser();
    const first = await loginWithOtp(email, password);
    const second = await loginWithOtp(email, password);
    const token = await requestToken(email);

    const res = await reset(token);
    expect(res.status).toBe(200);

    for (const { refreshToken } of [first, second]) {
      const refreshed = await api().post("/api/auth/refresh").send({ refreshToken });
      expect(refreshed.status).toBe(401);
    }
  });

  it("clears a pending login OTP", async () => {
    const { email, password } = await createVerifiedUser();
    const login = await api().post("/api/auth/login").send({ email, password });
    expect(login.status).toBe(200);
    const otp = lastOtpFor(email) as string;
    const token = await requestToken(email);

    const res = await reset(token);
    expect(res.status).toBe(200);

    const verify = await api().post("/api/auth/verify-otp").send({ email, otp });
    expect(verify.status).toBe(401);
  });

  it("rejects reuse of the same token", async () => {
    const { email } = await createVerifiedUser();
    const token = await requestToken(email);

    const first = await reset(token);
    expect(first.status).toBe(200);

    const second = await reset(token, "another-password");
    expect(second.status).toBe(400);
  });

  it("rejects an expired token", async () => {
    const { email } = await createVerifiedUser();
    const token = await requestToken(email);
    await prisma.passwordResetToken.updateMany({
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const res = await reset(token);

    expect(res.status).toBe(400);
  });

  it("rejects a random token", async () => {
    const res = await reset("random-token-value");

    expect(res.status).toBe(400);
  });

  it("lets exactly one of two concurrent resets with the same token succeed", async () => {
    const { email } = await createVerifiedUser();
    const token = await requestToken(email);

    const results = await Promise.all([reset(token), reset(token)]);

    const statuses = results.map((res) => res.status).sort();
    expect(statuses).toEqual([200, 400]);
  });

  it("marks an unverified user as verified so they can log in with the new password", async () => {
    const { res: registerRes, email } = await registerUser();
    expect(registerRes.status).toBe(201);
    const token = await requestToken(email);

    const res = await reset(token);
    expect(res.status).toBe(200);

    const user = await prisma.user.findUnique({ where: { email } });
    expect(user?.emailVerified).toBe(true);

    const login = await api().post("/api/auth/login").send({ email, password: NEW_PASSWORD });
    expect(login.status).toBe(200);
    expect(login.body).toEqual({ otpRequired: true, resendAfterSeconds: 60 });
  });
});
