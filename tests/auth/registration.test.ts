import { describe, expect, it } from "vitest";
import { prisma } from "../../src/common/prisma";
import { endVerificationCooldown, registerUser } from "../helpers/auth";
import { lastLinkFor, outbox, tokenFromLink } from "../helpers/mailer";
import { api, bodyOf } from "../helpers/request";

function tokenFor(email: string): string {
  return tokenFromLink(lastLinkFor(email) as string) as string;
}

describe("registration", () => {
  it("registers a user with public fields only and sends one verification email", async () => {
    const { res, email } = await registerUser();

    expect(res.status).toBe(201);
    const body = bodyOf<{ email: string; emailVerified: boolean }>(res);
    expect(Object.keys(body).sort()).toEqual(
      ["email", "emailVerified", "id", "name", "role", "selectedRestaurantId"].sort(),
    );
    expect(body.email).toBe(email);
    expect(body.emailVerified).toBe(false);
    expect(outbox).toHaveLength(1);
    expect(tokenFor(email)).toBeTruthy();
  });

  it("rejects a duplicate email with 409", async () => {
    const { email } = await registerUser();
    const { res } = await registerUser({ email });

    expect(res.status).toBe(409);
  });

  it("rejects a malformed body with field errors", async () => {
    const res = await api()
      .post("/api/auth/register")
      .send({ email: "not-an-email", password: "short", name: "X" });

    expect(res.status).toBe(400);
    const body = bodyOf<{ message: string; details: Record<string, unknown> }>(res);
    expect(body.message).toBe("Validation failed");
    expect(body.details.email).toBeDefined();
    expect(body.details.password).toBeDefined();
  });
});

describe("verify-email", () => {
  it("verifies the user and rejects token reuse", async () => {
    const { email } = await registerUser();
    const token = tokenFor(email);

    const res = await api().get("/api/auth/verify-email").query({ token });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.emailVerified).toBe(true);

    const reuse = await api().get("/api/auth/verify-email").query({ token });
    expect(reuse.status).toBe(400);
  });

  it("rejects an expired token", async () => {
    const { email } = await registerUser();
    const token = tokenFor(email);
    await prisma.emailVerificationToken.updateMany({
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const res = await api().get("/api/auth/verify-email").query({ token });

    expect(res.status).toBe(400);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.emailVerified).toBe(false);
  });
});

describe("resend-verification", () => {
  it("sends a new email after the cooldown", async () => {
    const { email } = await registerUser();
    const firstToken = tokenFor(email);
    await endVerificationCooldown(email);

    const res = await api().post("/api/auth/resend-verification").send({ email });

    expect(res.status).toBe(200);
    expect(outbox).toHaveLength(2);
    expect(tokenFor(email)).not.toBe(firstToken);
  });

  it("sends nothing within the cooldown", async () => {
    const { email } = await registerUser();

    const res = await api().post("/api/auth/resend-verification").send({ email });

    expect(res.status).toBe(200);
    expect(outbox).toHaveLength(1);
  });

  it("returns an identical body for unknown and verified accounts and sends nothing", async () => {
    const { email } = await registerUser();
    const token = tokenFor(email);
    await endVerificationCooldown(email);
    const real = await api().post("/api/auth/resend-verification").send({ email });
    outbox.length = 0;

    const unknown = await api()
      .post("/api/auth/resend-verification")
      .send({ email: "nobody@example.com" });
    expect(unknown.status).toBe(200);
    expect(unknown.body).toEqual(real.body);
    expect(outbox).toHaveLength(0);

    await api().get("/api/auth/verify-email").query({ token });
    const verified = await api().post("/api/auth/resend-verification").send({ email });
    expect(verified.status).toBe(200);
    expect(verified.body).toEqual(real.body);
    expect(outbox).toHaveLength(0);
  });
});

describe("login before verification", () => {
  it("returns 403 EMAIL_NOT_VERIFIED and sends no OTP", async () => {
    const { email, password } = await registerUser();
    outbox.length = 0;

    const res = await api().post("/api/auth/login").send({ email, password });

    expect(res.status).toBe(403);
    expect(bodyOf<{ code: string }>(res).code).toBe("EMAIL_NOT_VERIFIED");
    expect(outbox).toHaveLength(0);
  });
});
