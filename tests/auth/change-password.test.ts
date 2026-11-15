import { describe, expect, it } from "vitest";
import { prisma } from "../../src/common/prisma";
import { createVerifiedUser, loginWithOtp } from "../helpers/auth";
import { lastLinkFor, lastOtpFor, tokenFromLink } from "../helpers/mailer";
import { api } from "../helpers/request";

const NEW_PASSWORD = "brand-new-password";

interface ChangeInput {
  currentPassword?: string;
  newPassword?: string;
  refreshToken?: string;
}

function change(accessToken: string | null, input: ChangeInput) {
  const req = api().post("/api/auth/change-password");
  if (accessToken) {
    req.set("Authorization", `Bearer ${accessToken}`);
  }

  return req.send(input);
}

function refresh(refreshToken: string) {
  return api().post("/api/auth/refresh").send({ refreshToken });
}

function login(email: string, password: string) {
  return api().post("/api/auth/login").send({ email, password });
}

describe("change-password", () => {
  it("changes the password and keeps only the current session", async () => {
    const { id, email, password } = await createVerifiedUser();
    const a = await loginWithOtp(email, password);
    const b = await loginWithOtp(email, password);

    const res = await change(a.accessToken, {
      currentPassword: password,
      newPassword: NEW_PASSWORD,
      refreshToken: a.refreshToken,
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect(await prisma.session.count({ where: { userId: id } })).toBe(1);

    const refreshB = await refresh(b.refreshToken);
    expect(refreshB.status).toBe(401);

    const refreshA = await refresh(a.refreshToken);
    expect(refreshA.status).toBe(200);

    const newLogin = await login(email, NEW_PASSWORD);
    expect(newLogin.status).toBe(200);

    const oldLogin = await login(email, password);
    expect(oldLogin.status).toBe(401);
  });

  it("clears a pending OTP", async () => {
    const { email, password } = await createVerifiedUser();
    const tokens = await loginWithOtp(email, password);

    const pending = await login(email, password);
    expect(pending.status).toBe(200);
    const otp = lastOtpFor(email) as string;

    const res = await change(tokens.accessToken, {
      currentPassword: password,
      newPassword: NEW_PASSWORD,
      refreshToken: tokens.refreshToken,
    });
    expect(res.status).toBe(200);

    const verify = await api().post("/api/auth/verify-otp").send({ email, otp });
    expect(verify.status).toBe(401);
  });

  it("rejects a wrong current password and leaves sessions untouched", async () => {
    const { id, email, password } = await createVerifiedUser();
    const a = await loginWithOtp(email, password);
    await loginWithOtp(email, password);

    const res = await change(a.accessToken, {
      currentPassword: "not-the-password",
      newPassword: NEW_PASSWORD,
      refreshToken: a.refreshToken,
    });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: "INVALID_CURRENT_PASSWORD" });
    expect(await prisma.session.count({ where: { userId: id } })).toBe(2);
  });

  it("rejects a new password equal to the current one", async () => {
    const { email, password } = await createVerifiedUser();
    const tokens = await loginWithOtp(email, password);

    const res = await change(tokens.accessToken, {
      currentPassword: password,
      newPassword: password,
      refreshToken: tokens.refreshToken,
    });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: "SAME_PASSWORD" });
  });

  it("rejects a refresh token that belongs to another user", async () => {
    const first = await createVerifiedUser();
    const second = await createVerifiedUser();
    const firstTokens = await loginWithOtp(first.email, first.password);
    const secondTokens = await loginWithOtp(second.email, second.password);

    const res = await change(firstTokens.accessToken, {
      currentPassword: first.password,
      newPassword: NEW_PASSWORD,
      refreshToken: secondTokens.refreshToken,
    });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: "INVALID_REFRESH_TOKEN" });

    const oldLogin = await login(first.email, first.password);
    expect(oldLogin.status).toBe(200);
  });

  it("rejects a request without an Authorization header", async () => {
    const res = await change(null, {
      currentPassword: "password123",
      newPassword: NEW_PASSWORD,
      refreshToken: "whatever",
    });

    expect(res.status).toBe(401);
  });

  it("rejects a new password shorter than 8 characters", async () => {
    const { email, password } = await createVerifiedUser();
    const tokens = await loginWithOtp(email, password);

    const res = await change(tokens.accessToken, {
      currentPassword: password,
      newPassword: "short",
      refreshToken: tokens.refreshToken,
    });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ message: "Validation failed" });
  });

  it("rate limits repeated wrong current passwords", async () => {
    const { email, password } = await createVerifiedUser();
    const tokens = await loginWithOtp(email, password);
    const attempt = () =>
      change(tokens.accessToken, {
        currentPassword: "not-the-password",
        newPassword: NEW_PASSWORD,
        refreshToken: tokens.refreshToken,
      });

    for (let i = 0; i < 10; i += 1) {
      const res = await attempt();
      expect(res.status).toBe(400);
    }

    const blocked = await attempt();
    expect(blocked.status).toBe(429);
    expect(blocked.body).toMatchObject({ code: "RATE_LIMITED" });
  });

  it("invalidates reset links requested before the change", async () => {
    const { email, password } = await createVerifiedUser();
    const tokens = await loginWithOtp(email, password);
    const forgot = await api().post("/api/auth/forgot-password").send({ email });
    expect(forgot.status).toBe(200);
    const resetToken = tokenFromLink(lastLinkFor(email) as string) as string;

    const changed = await change(tokens.accessToken, {
      currentPassword: password,
      newPassword: NEW_PASSWORD,
      refreshToken: tokens.refreshToken,
    });
    expect(changed.status).toBe(200);

    const res = await api()
      .post("/api/auth/reset-password")
      .send({ token: resetToken, password: "another-new-password" });
    expect(res.status).toBe(400);
  });
});
