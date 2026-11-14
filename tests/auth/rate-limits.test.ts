import { describe, expect, it } from "vitest";
import { createVerifiedUser } from "../helpers/auth";
import { api } from "../helpers/request";

function login(email: string, password: string) {
  return api().post("/api/auth/login").send({ email, password });
}

function forgot(email: string) {
  return api().post("/api/auth/forgot-password").send({ email });
}

describe("login limiter", () => {
  it("blocks the 11th failed attempt", async () => {
    const { email } = await createVerifiedUser();

    for (let i = 0; i < 10; i += 1) {
      const res = await login(email, "wrong-password");
      expect(res.status).toBe(401);
    }

    const blocked = await login(email, "wrong-password");
    expect(blocked.status).toBe(429);
    expect(blocked.body).toMatchObject({ code: "RATE_LIMITED" });
  });

  it("does not count successful logins", async () => {
    const { email, password } = await createVerifiedUser();

    for (let i = 0; i < 9; i += 1) {
      const res = await login(email, "wrong-password");
      expect(res.status).toBe(401);
    }

    for (let i = 0; i < 3; i += 1) {
      const res = await login(email, password);
      expect(res.status).toBe(200);
    }

    const tenth = await login(email, "wrong-password");
    expect(tenth.status).toBe(401);

    const blocked = await login(email, "wrong-password");
    expect(blocked.status).toBe(429);
  });
});

describe("email sending limiter", () => {
  it("blocks the 11th forgot-password request", async () => {
    for (let i = 0; i < 10; i += 1) {
      const res = await forgot("nobody@example.com");
      expect(res.status).toBe(200);
    }

    const blocked = await forgot("nobody@example.com");
    expect(blocked.status).toBe(429);
    expect(blocked.body).toMatchObject({ code: "RATE_LIMITED" });
  });

  it("is shared across routes", async () => {
    for (let i = 0; i < 10; i += 1) {
      const res = await forgot("nobody@example.com");
      expect(res.status).toBe(200);
    }

    const res = await api()
      .post("/api/auth/register")
      .send({ email: "new@example.com", password: "password123", name: "New User" });

    expect(res.status).toBe(429);
  });
});

describe("general limiter", () => {
  it("blocks the 101st request to an auth route", async () => {
    for (let i = 0; i < 100; i += 1) {
      const res = await api().post("/api/auth/logout").send({ refreshToken: "random-token" });
      expect(res.status).toBe(204);
    }

    const blocked = await api().post("/api/auth/logout").send({ refreshToken: "random-token" });
    expect(blocked.status).toBe(429);
    expect(blocked.body).toMatchObject({ code: "RATE_LIMITED" });
  });
});
