import crypto from "crypto";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import authRoutes from "./modules/auth/auth.routes";
import { notFoundHandler } from "./common/middlewares/not-found";
import { errorHandler } from "./common/middlewares/error-handler";
import { apiReference } from "@scalar/express-api-reference";
import { openApiDocument } from "./docs/openapi";
import { env } from "./env";

export const moduleRouters = {
  "/api/auth": authRoutes,
};

const app = express();

app.set("trust proxy", env.TRUST_PROXY);

const SCALAR_CDN = "https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.78.1";

const docsCsp = helmet({
  contentSecurityPolicy: {
    directives: {
      scriptSrc: [
        "'self'",
        "https://cdn.jsdelivr.net",
        (_req, res) => `'nonce-${(res as express.Response).locals.nonce as string}'`,
      ],
      styleSrc: ["'self'", "'unsafe-inline'"],
      fontSrc: ["'self'", "https://fonts.scalar.com", "data:"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
    },
  },
});

const defaultHelmet = helmet();

app.use((req, res, next) => {
  if (req.path === "/docs" || req.path === "/docs/") {
    res.locals.nonce = crypto.randomBytes(16).toString("base64");

    return docsCsp(req, res, next);
  }

  return defaultHelmet(req, res, next);
});

app.use(cors({ origin: [new URL(env.FRONTEND_URL).origin] }));

app.use(express.json());

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.get("/openapi.json", (_req, res) => res.json(openApiDocument));

app.get("/docs", (req, res, next) => {
  const handler = apiReference({
    url: "/openapi.json",
    cdn: SCALAR_CDN,
    agent: { disabled: true },
    showDeveloperTools: "always",
    authentication: { preferredSecurityScheme: "bearerAuth" },
    nonce: res.locals.nonce as string,
  }) as unknown as express.RequestHandler;

  return handler(req, res, next);
});

for (const [path, router] of Object.entries(moduleRouters)) {
  app.use(path, router);
}

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
