import { afterAll, beforeEach, vi } from "vitest";
import { assertTestDatabase } from "./test-db";

assertTestDatabase();

vi.mock("../src/common/utils/mailer", async () => {
  const { outbox, isSendingFailing, runOnSend } = await import("./helpers/mailer");

  return {
    sendMail: async (to: string, subject: string, html: string): Promise<void> => {
      await runOnSend();

      if (isSendingFailing()) {
        throw new Error("smtp down");
      }

      outbox.push({ to, subject, html });
    },
  };
});

beforeEach(async () => {
  const { prisma } = await import("../src/common/prisma");
  const { resetRateLimiters } = await import("../src/common/middlewares/rate-limit");
  const { clearOutbox, setSendingFails, setOnSend } = await import("./helpers/mailer");

  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;

  if (tables.length > 0) {
    const list = tables.map((t) => `"${t.tablename.replace(/"/g, '""')}"`).join(", ");
    await prisma.$executeRawUnsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
  }

  await resetRateLimiters();
  clearOutbox();
  setSendingFails(false);
  setOnSend(null);
});

afterAll(async () => {
  const { prisma } = await import("../src/common/prisma");
  await prisma.$disconnect();
});
