import { describe, expect, it } from "vitest";
import { api } from "./helpers/request";

const ALLOWED_ORIGIN = "http://localhost:3000";
const FOREIGN_ORIGIN = "https://evil.example";

describe("cors", () => {
  it("allows the configured frontend origin", async () => {
    const res = await api().get("/health").set("Origin", ALLOWED_ORIGIN);

    expect(res.headers["access-control-allow-origin"]).toBe(ALLOWED_ORIGIN);
  });

  it("does not allow a foreign origin", async () => {
    const res = await api().get("/health").set("Origin", FOREIGN_ORIGIN);

    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("answers a preflight for the allowed origin", async () => {
    const res = await api()
      .options("/api/auth/login")
      .set("Origin", ALLOWED_ORIGIN)
      .set("Access-Control-Request-Method", "POST");

    expect(res.status).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe(ALLOWED_ORIGIN);
  });

  it("does not allow a preflight from a foreign origin", async () => {
    const res = await api()
      .options("/api/auth/login")
      .set("Origin", FOREIGN_ORIGIN)
      .set("Access-Control-Request-Method", "POST");

    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });
});
