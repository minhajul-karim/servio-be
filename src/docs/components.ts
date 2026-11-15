import { z } from "zod";

export const ErrorSchema = z
  .object({
    message: z.string().meta({ example: "Validation failed" }),
    code: z.string().optional().meta({
      description: "Machine-readable reason. Branch on this, not on message.",
      example: "EMAIL_NOT_VERIFIED",
    }),
    retryAfterSeconds: z.number().int().optional().meta({
      description: "Seconds until the request can succeed. Also sent as the Retry-After header.",
      example: 840,
    }),
    details: z
      .record(z.string(), z.array(z.string()))
      .optional()
      .meta({
        description: "Validation errors only: field name to the list of messages for that field.",
        example: { email: ["Invalid email address"] },
      }),
  })
  .meta({ id: "Error" });

export const jsonError = (description: string) => ({
  description,
  content: { "application/json": { schema: ErrorSchema } },
});

export const jsonResponse = (description: string, schema: z.ZodType) => ({
  description,
  content: { "application/json": { schema } },
});
