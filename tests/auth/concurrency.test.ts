import jwt from "jsonwebtoken";
import { describe, expect, it } from "vitest";
import { prisma } from "../../src/common/prisma";
import { createVerifiedUser, registerUser } from "../helpers/auth";
import { lastLinkFor, lastOtpFor, tokenFromLink } from "../helpers/mailer";
import { api, bodyOf } from "../helpers/request";

describe("verify-email concurrency", () => {
  it("lets exactly one of two parallel clicks succeed and returns a clean 400 for the other", async () => {
    const { email } = await registerUser();
    const token = tokenFromLink(lastLinkFor(email) as string) as string;

    const results = await Promise.all([
      api().get("/api/auth/verify-email").query({ token }),
      api().get("/api/auth/verify-email").query({ token }),
    ]);

    const statuses = results.map((res) => res.status).sort();
    expect(statuses).toEqual([200, 400]);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.emailVerified).toBe(true);
  });
});

describe("verify-otp concurrency", () => {
  it("lets exactly one of two parallel correct codes win and creates one session", async () => {
    const { email, password, id } = await createVerifiedUser();
    const loginRes = await api().post("/api/auth/login").send({ email, password });
    expect(loginRes.status).toBe(200);
    const otp = lastOtpFor(email) as string;

    const results = await Promise.all([
      api().post("/api/auth/verify-otp").send({ email, otp }),
      api().post("/api/auth/verify-otp").send({ email, otp }),
    ]);

    const statuses = results.map((res) => res.status).sort();
    expect(statuses).toEqual([200, 401]);
    const winner = results.find((res) => res.status === 200);
    const body = bodyOf<{ accessToken: string; refreshToken: string }>(winner as { body: unknown });
    expect(body.accessToken).toBeTruthy();
    expect(body.refreshToken).toBeTruthy();
    expect(await prisma.session.count({ where: { userId: id } })).toBe(1);
  });
});

describe("access token algorithm", () => {
  it("rejects a token signed with a different algorithm", async () => {
    const { id } = await createVerifiedUser();
    const token = jwt.sign({ userId: id, role: "CUSTOMER" }, process.env.JWT_SECRET as string, {
      algorithm: "HS512",
      expiresIn: "15m",
    });

    const res = await api().get("/api/auth/me").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(401);
  });
});
