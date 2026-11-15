import "dotenv/config";
import { z } from "zod";

const envSchema = z
  .object({
    DATABASE_URL: z.url(),
    PORT: z.coerce.number().int().positive().default(5000),
    TRUST_PROXY: z.coerce.number().int().min(0).default(0),
    JWT_SECRET: z.string().min(32),
    FRONTEND_URL: z.url(),
    GMAIL_USER: z.email(),
    GMAIL_APP_PASSWORD: z.string(),
    BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),
  })
  .superRefine((data, ctx) => {
    if (data.BCRYPT_ROUNDS < 10 && process.env.NODE_ENV !== "test") {
      ctx.addIssue({
        code: "custom",
        path: ["BCRYPT_ROUNDS"],
        message: "BCRYPT_ROUNDS must be at least 10 outside the test environment",
      });
    }
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:", z.flattenError(parsed.error).fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
