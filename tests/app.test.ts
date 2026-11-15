import { describe, expect, it } from "vitest";
import { api } from "./helpers/request";

describe("app hardening", () => {
  it("returns 400 for malformed JSON bodies", async () => {
    const res = await api()
      .post("/api/auth/login")
      .set("Content-Type", "application/json")
      .send("{bad json");

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "Malformed JSON body" });
  });

  it("returns 413 for oversized JSON bodies", async () => {
    const res = await api()
      .post("/api/auth/login")
      .send({ email: "a@example.com", password: "x".repeat(200 * 1024) });

    expect(res.status).toBe(413);
    expect(res.body).toEqual({ message: "Request body too large" });
  });

  it("sets security headers and hides x-powered-by", async () => {
    const res = await api().get("/health");

    expect(res.headers["x-powered-by"]).toBeUndefined();
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });
});
