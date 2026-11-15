import { describe, expect, it } from "vitest";
import { createVerifiedUser, loginWithOtp, registerUser } from "../helpers/auth";
import { clearOutbox, lastLinkFor, outbox, tokenFromLink } from "../helpers/mailer";
import { api } from "../helpers/request";

describe("register input limits", () => {
  it("rejects a password whose tail would be cut off by bcrypt", async () => {
    const { res } = await registerUser({ password: `${"a".repeat(72)}SECRET-TAIL` });

    expect(res.status).toBe(400);
  });

  it("accepts a 64-char password and rejects a 65-char one", async () => {
    const ok = await registerUser({ password: "a".repeat(64) });
    const tooLong = await registerUser({ password: "a".repeat(65) });

    expect(ok.res.status).toBe(201);
    expect(tooLong.res.status).toBe(400);
  });

  it("rejects a password over 72 bytes even when under 64 chars", async () => {
    const { res } = await registerUser({ password: "😀".repeat(20) });

    expect(res.status).toBe(400);
  });

  it("accepts a 100-char name and rejects a 101-char one", async () => {
    const ok = await registerUser({ name: "n".repeat(100) });
    const tooLong = await registerUser({ name: "n".repeat(101) });

    expect(ok.res.status).toBe(201);
    expect(tooLong.res.status).toBe(400);
  });

  it("rejects an email longer than 254 characters", async () => {
    const { res } = await registerUser({ email: `${"a".repeat(64)}@${"b".repeat(190)}.com` });

    expect(res.status).toBe(400);
  });
});

describe("password change limits", () => {
  it("rejects a 65-char new password on reset-password", async () => {
    const { email } = await createVerifiedUser();
    await api().post("/api/auth/forgot-password").send({ email });
    const token = tokenFromLink(lastLinkFor(email) as string) as string;

    const res = await api()
      .post("/api/auth/reset-password")
      .send({ token, password: "a".repeat(65) });

    expect(res.status).toBe(400);
  });

  it("rejects a 65-char new password on change-password", async () => {
    const { email, password } = await createVerifiedUser();
    const tokens = await loginWithOtp(email, password);

    const res = await api()
      .post("/api/auth/change-password")
      .set("Authorization", `Bearer ${tokens.accessToken}`)
      .send({
        currentPassword: password,
        newPassword: "a".repeat(65),
        refreshToken: tokens.refreshToken,
      });

    expect(res.status).toBe(400);
  });
});

describe("login input", () => {
  it("rejects an oversized password with 400 and sends no email", async () => {
    const { email } = await createVerifiedUser();
    clearOutbox();

    const res = await api()
      .post("/api/auth/login")
      .send({ email, password: "a".repeat(100) });

    expect(res.status).toBe(400);
    expect(outbox).toHaveLength(0);
  });

  it("ignores a legacy rememberMe field", async () => {
    const { email, password } = await createVerifiedUser();

    const res = await api().post("/api/auth/login").send({ email, password, rememberMe: true });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ otpRequired: true });
  });
});
