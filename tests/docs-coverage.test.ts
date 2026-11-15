import type { Router } from "express";
import { describe, expect, it } from "vitest";
import { Validator } from "@seriousme/openapi-schema-validator";
import app, { moduleRouters } from "../src/app";
import { openApiDocument } from "../src/docs/openapi";

type RouteLayer = {
  route?: { path: string; methods: Record<string, boolean> };
};

const DOCS_ENDPOINTS = new Set(["/openapi.json", "/docs"]);

const toOpenApiPath = (path: string) => path.replace(/:([A-Za-z0-9_]+)/g, "{$1}");

const joinPaths = (prefix: string, path: string) => (path === "/" ? prefix : prefix + path);

const routesOf = (stack: RouteLayer[], prefix: string): string[] => {
  const found: string[] = [];

  for (const layer of stack) {
    if (!layer.route) {
      continue;
    }

    const path = toOpenApiPath(joinPaths(prefix, layer.route.path));

    for (const method of Object.keys(layer.route.methods)) {
      found.push(`${method.toUpperCase()} ${path}`);
    }
  }

  return found;
};

const collectRealRoutes = (): string[] => {
  const appRoutes = routesOf(app.router.stack as RouteLayer[], "").filter((entry) => {
    return !DOCS_ENDPOINTS.has(entry.slice(entry.indexOf(" ") + 1));
  });

  const moduleRoutes = Object.entries(moduleRouters).flatMap(([mountPath, router]) => {
    return routesOf((router as Router).stack as RouteLayer[], mountPath);
  });

  return [...appRoutes, ...moduleRoutes].sort();
};

const collectDocumentedRoutes = (): string[] => {
  const found: string[] = [];

  for (const [path, item] of Object.entries(openApiDocument.paths ?? {})) {
    for (const method of ["get", "post", "put", "patch", "delete"]) {
      if ((item as Record<string, unknown>)[method]) {
        found.push(`${method.toUpperCase()} ${path}`);
      }
    }
  }

  return found.sort();
};

describe("docs coverage", () => {
  const real = collectRealRoutes();
  const documented = collectDocumentedRoutes();

  it("finds the real routes", () => {
    expect(real.length).toBeGreaterThan(0);
    expect(real).toContain("GET /api/auth/me");
    expect(real).toContain("GET /health");
  });

  it("documents every real route", () => {
    const missing = real.filter((route) => !documented.includes(route));

    expect(missing, `Routes missing from the OpenAPI docs:\n${missing.join("\n")}`).toEqual([]);
  });

  it("has no documented route that does not exist", () => {
    const stale = documented.filter((route) => !real.includes(route));

    expect(stale, `Documented routes with no real route:\n${stale.join("\n")}`).toEqual([]);
  });

  it("produces a valid OpenAPI 3.1 document", async () => {
    const result = await new Validator().validate(
      JSON.parse(JSON.stringify(openApiDocument)) as Record<string, unknown>,
    );

    expect(result.valid, JSON.stringify(result, null, 2)).toBe(true);
  });
});
