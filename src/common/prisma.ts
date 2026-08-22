/**
 * TODO: implement the shared Prisma client instance.
 *
 * Purpose: every file that needs the database (auth.service.ts, and every
 * future module's service file) should import ONE shared PrismaClient
 * instance from here — not construct `new PrismaClient()` in each file.
 * Each instance opens its own connection pool, so multiple instances waste
 * connections; a single shared one is the standard pattern.
 *
 * What to implement:
 *   import { PrismaClient } from "../generated/prisma/client";
 *   export const prisma = new PrismaClient();
 *
 * Dev-mode gotcha worth knowing: with ts-node-dev's hot-reloading (already
 * used here via the `dev` script), a naive singleton can get re-created on
 * every file change, slowly leaking connections during development. The
 * common fix is caching the instance on `globalThis` in non-production
 * environments — worth looking up "Prisma Next.js dev connection" style
 * examples for the exact pattern if you hit connection warnings while
 * iterating.
 */
