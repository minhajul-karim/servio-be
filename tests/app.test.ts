import { describe, expect, it, vi } from "vitest";
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

  it("returns 415 without logging for unsupported charsets", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      const res = await api()
        .post("/api/auth/login")
        .set("Content-Type", "application/json; charset=latin1")
        .send(JSON.stringify({ email: "a@example.com", password: "x" }));

      expect(res.status).toBe(415);
      expect(errorSpy).not.toHaveBeenCalled();
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("sets security headers and hides x-powered-by", async () => {
    const res = await api().get("/health");

    expect(res.headers["x-powered-by"]).toBeUndefined();
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });
});
