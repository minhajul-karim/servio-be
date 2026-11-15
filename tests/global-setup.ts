import { execSync } from "node:child_process";
import { Client } from "pg";
import { assertTestDatabase } from "./test-db";

export default async function setup(): Promise<void> {
  const url = assertTestDatabase();
  const dbName = decodeURIComponent(url.pathname.replace(/^\//, ""));

  const adminUrl = new URL(url.toString());
  adminUrl.pathname = "/postgres";
  adminUrl.search = "";

  const client = new Client({ connectionString: adminUrl.toString() });
  await client.connect();

  try {
    const existing = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);

    if (existing.rowCount === 0) {
      const quoted = `"${dbName.replace(/"/g, '""')}"`;
      await client.query(`CREATE DATABASE ${quoted}`);
    }
  } finally {
    await client.end();
  }

  execSync("pnpm exec prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: url.toString() },
  });
}
