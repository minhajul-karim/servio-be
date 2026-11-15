import { describe, expect, it } from "vitest";
import { prisma } from "../../src/common/prisma";
import { createVerifiedUser, registerUser } from "../helpers/auth";
import { clearOutbox, lastOtpFor, outbox } from "../helpers/mailer";
import { api, bodyOf } from "../helpers/request";

function uniqueLocalPart(): string {
  return `alice${Date.now()}${Math.floor(Math.random() * 100000)}`;
}

describe("email normalization", () => {
  it("stores a mixed-case, padded email as lowercase", async () => {
    const local = uniqueLocalPart();

    const { res } = await registerUser({
      email: `  ${local[0].toUpperCase()}${local.slice(1)}@Example.COM  `,
    });

    expect(res.status).toBe(201);
    const expected = `${local}@example.com`;
    expect(bodyOf<{ email: string }>(res).email).toBe(expected);
    const user = await prisma.user.findUnique({ where: { email: expected } });
    expect(user).not.toBeNull();
  });

  it("rejects a differently-cased duplicate with 409", async () => {
    const local = uniqueLocalPart();
    const first = await registerUser({ email: `${local}@Example.com` });
    expect(first.res.status).toBe(201);

    const second = await registerUser({ email: `${local}@example.com` });

    expect(second.res.status).toBe(409);
  });

  it("logs in with a different email case and issues an OTP", async () => {
    const local = uniqueLocalPart();
    const { password } = await createVerifiedUser({ email: `${local}@example.com` });
    clearOutbox();

    const res = await api()
      .post("/api/auth/login")
      .send({ email: `  ${local.toUpperCase()}@Example.com `, password });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ otpRequired: true, resendAfterSeconds: 60 });
    expect(lastOtpFor(`${local}@example.com`)).toMatch(/^\d{6}$/);
  });

  it("sends the reset email for forgot-password with a different case", async () => {
    const local = uniqueLocalPart();
    await createVerifiedUser({ email: `${local}@example.com` });
    clearOutbox();

    const res = await api()
      .post("/api/auth/forgot-password")
      .send({ email: `${local.toUpperCase()}@EXAMPLE.com` });

    expect(res.status).toBe(200);
    expect(outbox).toHaveLength(1);
    expect(outbox[0].to).toBe(`${local}@example.com`);
  });
});
