import { describe, expect, it } from "vitest";
import { lastLinkFor, outbox, tokenFromLink } from "./helpers/mailer";
import { api } from "./helpers/request";

describe("smoke", () => {
  it("GET /health returns ok", async () => {
    const res = await api().get("/health");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  it("registers a user and sends one verification email", async () => {
    const email = "smoke@example.com";
    const res = await api()
      .post("/api/auth/register")
      .send({ email, password: "password123", name: "Smoke" });

    expect(res.status).toBe(201);
    expect(outbox).toHaveLength(1);
    expect(outbox[0].to).toBe(email);

    const link = lastLinkFor(email);
    expect(link).toBeDefined();
    expect(tokenFromLink(link as string)).toBeTruthy();
  });
});
