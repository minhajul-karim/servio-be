/**
 * TODO: build the Express app here (separate from index.ts).
 *
 * Purpose: index.ts currently both builds AND starts the Express app in
 * one file. Splitting them means app.ts can be imported on its own (e.g. by
 * a future test using supertest) without actually opening a port — index.ts
 * becomes just the "turn it on" file. Nothing to change in index.ts yet;
 * this file is a placeholder until the pieces it wires together exist.
 *
 * Intended contents, once the pieces below are implemented:
 *
 *   import express from "express";
 *   import authRoutes from "./modules/auth/auth.routes";
 *   import { notFoundHandler } from "./common/middlewares/not-found";
 *   import { errorHandler } from "./common/middlewares/error-handler";
 *
 *   const app = express();
 *
 *   app.use(express.json());
 *
 *   app.get("/health", (_req, res) => { res.json({ status: "ok" }); });
 *   // ^ same /health route currently in index.ts — move it here
 *
 *   app.use("/api/auth", authRoutes);
 *
 *   app.use(notFoundHandler);   // after every real route
 *   app.use(errorHandler);      // must be last of all
 *
 *   export default app;
 *
 * Ordering matters: notFoundHandler must come after all real routes (else
 * it swallows requests meant for routes registered later), and errorHandler
 * must be the very last app.use() call of all.
 */
