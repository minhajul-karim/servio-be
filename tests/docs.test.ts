import { describe, expect, it } from "vitest";
import { api, bodyOf } from "./helpers/request";

describe("docs", () => {
  it("GET /openapi.json returns an OpenAPI 3 document with /health", async () => {
    const res = await api().get("/openapi.json");

    expect(res.status).toBe(200);
    const body = bodyOf<{ openapi: string; paths: Record<string, { get?: unknown }> }>(res);

    expect(body.openapi).toMatch(/^3\./);
    expect(body.paths["/health"].get).toBeDefined();
  });

  it("GET /docs returns the HTML page", async () => {
    const res = await api().get("/docs");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
  });

  it("allows the Scalar CDN script only on /docs", async () => {
    const docs = await api().get("/docs");
    const health = await api().get("/health");

    expect(docs.headers["content-security-policy"]).toContain(
      "script-src 'self' https://cdn.jsdelivr.net",
    );
    expect(health.headers["content-security-policy"]).toContain("script-src 'self'");
    expect(health.headers["content-security-policy"]).not.toContain("cdn.jsdelivr.net");
  });

  it("serves /docs/ with the same relaxed policy", async () => {
    const res = await api().get("/docs/");

    expect(res.status).toBe(200);
    expect(res.headers["content-security-policy"]).toContain("https://cdn.jsdelivr.net");
  });

  it("uses a fresh nonce per request that matches the page scripts", async () => {
    const first = await api().get("/docs");
    const second = await api().get("/docs");
    const nonceOf = (csp: string) => /'nonce-([^']+)'/.exec(csp)?.[1];
    const firstNonce = nonceOf(first.headers["content-security-policy"]);

    expect(firstNonce).toBeTruthy();
    expect(firstNonce).not.toBe(nonceOf(second.headers["content-security-policy"]));
    expect(first.text).toContain(`nonce="${firstNonce}"`);
    expect(first.text).toContain("@scalar/api-reference@1.78.1");
  });

  describe("auth documentation", () => {
    type Doc = {
      paths: Record<string, Record<string, { security?: unknown[]; responses: object }>>;
      components: { schemas: Record<string, unknown>; securitySchemes: Record<string, unknown> };
    };

    const authRoutes = [
      ["post", "/api/auth/register"],
      ["post", "/api/auth/login"],
      ["post", "/api/auth/verify-otp"],
      ["post", "/api/auth/resend-otp"],
      ["get", "/api/auth/verify-email"],
      ["post", "/api/auth/resend-verification"],
      ["post", "/api/auth/refresh"],
      ["post", "/api/auth/logout"],
      ["post", "/api/auth/forgot-password"],
      ["post", "/api/auth/reset-password"],
      ["post", "/api/auth/change-password"],
      ["get", "/api/auth/me"],
    ];

    it("documents all 12 auth routes with their methods", async () => {
      const doc = bodyOf<Doc>(await api().get("/openapi.json"));

      for (const [method, path] of authRoutes) {
        expect(doc.paths[path]?.[method], `${method} ${path}`).toBeDefined();
      }
    });

    it("requires bearerAuth only on change-password and me", async () => {
      const doc = bodyOf<Doc>(await api().get("/openapi.json"));

      expect(doc.components.securitySchemes.bearerAuth).toMatchObject({
        type: "http",
        scheme: "bearer",
      });
      expect(doc.paths["/api/auth/change-password"].post.security).toEqual([{ bearerAuth: [] }]);
      expect(doc.paths["/api/auth/me"].get.security).toEqual([{ bearerAuth: [] }]);

      for (const [method, path] of authRoutes) {
        if (path.endsWith("/change-password") || path.endsWith("/me")) {
          continue;
        }

        expect(doc.paths[path][method].security, path).toBeUndefined();
      }
    });

    it("exposes User, Tokens and Error as named components", async () => {
      const doc = bodyOf<Doc>(await api().get("/openapi.json"));

      expect(doc.components.schemas).toHaveProperty("User");
      expect(doc.components.schemas).toHaveProperty("Tokens");
      expect(doc.components.schemas).toHaveProperty("Error");
    });
  });

  it("serves /DOCS with the docs policy and a matching nonce", async () => {
    const res = await api().get("/DOCS");
    const csp = res.headers["content-security-policy"];
    const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];

    expect(res.status).toBe(200);
    expect(nonce).toBeTruthy();
    expect(res.text).toContain(`nonce="${nonce}"`);
    expect(res.text).not.toContain('nonce="undefined"');
  });
});
