import jwt from "jsonwebtoken";
import { describe, expect, it } from "vitest";
import { prisma } from "../../src/common/prisma";
import { type Tokens, createVerifiedUser, loginWithOtp } from "../helpers/auth";
import { api, bodyOf } from "../helpers/request";

const ONE_MINUTE_IN_MS = 60 * 1000;
const ONE_DAY_IN_MS = 24 * 60 * 60 * 1000;

function refresh(refreshToken: string) {
  return api().post("/api/auth/refresh").send({ refreshToken });
}

function me(authorization?: string) {
  const req = api().get("/api/auth/me");

  return authorization ? req.set("Authorization", authorization) : req;
}

async function setup(rememberMe?: boolean) {
  const user = await createVerifiedUser();
  const tokens = await loginWithOtp(user.email, user.password, { rememberMe });

  return { ...user, tokens };
}

describe("refresh", () => {
  it("rotates tokens and invalidates the old refresh token", async () => {
    const { tokens } = await setup();

    const res = await refresh(tokens.refreshToken);

    expect(res.status).toBe(200);
    const next = bodyOf<Tokens>(res);
    const meRes = await me(`Bearer ${next.accessToken}`);
    expect(meRes.status).toBe(200);
    expect(next.refreshToken).not.toBe(tokens.refreshToken);

    const old = await refresh(tokens.refreshToken);
    expect(old.status).toBe(401);

    const again = await refresh(next.refreshToken);
    expect(again.status).toBe(200);
  });

  it("preserves a rememberMe duration of about 30 days", async () => {
    const { id, tokens } = await setup(true);

    const res = await refresh(tokens.refreshToken);
    expect(res.status).toBe(200);

    const session = await prisma.session.findFirstOrThrow({ where: { userId: id } });
    const remaining = session.expiresAt.getTime() - Date.now();
    expect(Math.abs(remaining - 30 * ONE_DAY_IN_MS)).toBeLessThan(ONE_MINUTE_IN_MS);
  });

  it("preserves the default duration of about 1 day", async () => {
    const { id, tokens } = await setup();

    const res = await refresh(tokens.refreshToken);
    expect(res.status).toBe(200);

    const session = await prisma.session.findFirstOrThrow({ where: { userId: id } });
    const remaining = session.expiresAt.getTime() - Date.now();
    expect(Math.abs(remaining - ONE_DAY_IN_MS)).toBeLessThan(ONE_MINUTE_IN_MS);
  });

  it("keeps the original expiry instead of extending it", async () => {
    const { id, tokens } = await setup();
    const originalExpiry = new Date(Date.now() + 60 * ONE_MINUTE_IN_MS);
    await prisma.session.updateMany({
      where: { userId: id },
      data: {
        createdAt: new Date(Date.now() - 23 * 60 * ONE_MINUTE_IN_MS),
        expiresAt: originalExpiry,
      },
    });

    const res = await refresh(tokens.refreshToken);
    expect(res.status).toBe(200);

    const session = await prisma.session.findFirstOrThrow({ where: { userId: id } });
    expect(Math.abs(session.expiresAt.getTime() - originalExpiry.getTime())).toBeLessThan(1000);
  });

  it("does not extend a rememberMe session past its original expiry", async () => {
    const { id, tokens } = await setup(true);
    const originalExpiry = new Date(Date.now() + 29 * ONE_DAY_IN_MS);
    await prisma.session.updateMany({
      where: { userId: id },
      data: {
        createdAt: new Date(Date.now() - ONE_DAY_IN_MS),
        expiresAt: originalExpiry,
      },
    });

    const res = await refresh(tokens.refreshToken);
    expect(res.status).toBe(200);

    const session = await prisma.session.findFirstOrThrow({ where: { userId: id } });
    expect(Math.abs(session.expiresAt.getTime() - originalExpiry.getTime())).toBeLessThan(1000);
  });

  it("rejects an expired session", async () => {
    const { id, tokens } = await setup();
    await prisma.session.updateMany({
      where: { userId: id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const res = await refresh(tokens.refreshToken);

    expect(res.status).toBe(401);
  });

  it("rejects an unknown refresh token", async () => {
    const res = await refresh("not-a-real-token");

    expect(res.status).toBe(401);
  });

  it("lets exactly one of two concurrent refreshes with the same token succeed", async () => {
    const { id, tokens } = await setup();

    const results = await Promise.all([refresh(tokens.refreshToken), refresh(tokens.refreshToken)]);

    const statuses = results.map((res) => res.status).sort();
    expect(statuses).toEqual([200, 401]);
    expect(await prisma.session.count({ where: { userId: id } })).toBe(1);
  });
});

describe("logout", () => {
  it("returns 204 and revokes the refresh token", async () => {
    const { tokens } = await setup();

    const res = await api().post("/api/auth/logout").send({ refreshToken: tokens.refreshToken });
    expect(res.status).toBe(204);

    const after = await refresh(tokens.refreshToken);
    expect(after.status).toBe(401);
  });

  it("returns 204 for an unknown refresh token", async () => {
    const res = await api().post("/api/auth/logout").send({ refreshToken: "unknown-token" });

    expect(res.status).toBe(204);
  });
});

describe("me", () => {
  it("returns public user fields only for a valid access token", async () => {
    const { email, id, tokens } = await setup();

    const res = await me(`Bearer ${tokens.accessToken}`);

    expect(res.status).toBe(200);
    expect(Object.keys(bodyOf(res)).sort()).toEqual(
      ["email", "emailVerified", "id", "name", "role", "selectedRestaurantId"].sort(),
    );
    expect(res.body).toMatchObject({ id, email, emailVerified: true });
  });

  it("rejects a missing header", async () => {
    const res = await me();

    expect(res.status).toBe(401);
  });

  it("rejects a malformed header", async () => {
    const { tokens } = await setup();

    const res = await me(`Token ${tokens.accessToken}`);

    expect(res.status).toBe(401);
  });

  it("rejects an expired token", async () => {
    const { id } = await setup();
    const token = jwt.sign({ userId: id, role: "CUSTOMER" }, process.env.JWT_SECRET as string, {
      expiresIn: -10,
    });

    const res = await me(`Bearer ${token}`);

    expect(res.status).toBe(401);
  });

  it("rejects a token for a deleted user", async () => {
    const { id, tokens } = await setup();
    await prisma.user.delete({ where: { id } });

    const res = await me(`Bearer ${tokens.accessToken}`);

    expect(res.status).toBe(401);
  });

  it("rejects a token signed with a different secret", async () => {
    const { id } = await setup();
    const token = jwt.sign({ userId: id, role: "CUSTOMER" }, "some-other-secret-value", {
      expiresIn: "15m",
    });

    const res = await me(`Bearer ${token}`);

    expect(res.status).toBe(401);
  });
});
