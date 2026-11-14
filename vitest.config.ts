import path from "node:path";
import dotenv from "dotenv";
import { defineConfig } from "vitest/config";

const result = dotenv.config({ path: path.resolve(__dirname, ".env.test"), override: true });

export default defineConfig({
  test: {
    env: result.parsed ?? {},
    fileParallelism: false,
    globalSetup: ["./tests/global-setup.ts"],
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.ts"],
  },
});
