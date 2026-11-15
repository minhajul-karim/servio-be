import { createDocument } from "zod-openapi";
import { z } from "zod";
import { authPaths } from "../modules/auth/auth.openapi";

const healthPaths = {
  "/health": {
    get: {
      summary: "Health check",
      tags: ["System"],
      responses: {
        "200": {
          description: "The server is up",
          content: {
            "application/json": {
              schema: z.object({ status: z.literal("ok") }),
            },
          },
        },
      },
    },
  },
};

export const openApiDocument = createDocument({
  openapi: "3.1.0",
  info: {
    title: "Servio API",
    version: "1.0.0",
    description: `## How to try it

1. \`POST /api/auth/register\` with your real email.
2. Click the verification link in the email.
3. \`POST /api/auth/login\`, then \`POST /api/auth/verify-otp\` with the code from the email.
4. Copy the \`accessToken\` from the response, open the **Authentication** section and paste it in, then call \`GET /api/auth/me\`.

Access tokens expire after 15 minutes. Call \`POST /api/auth/refresh\` with your \`refreshToken\` to get a new one.

## Errors

Every error is \`{ message, code?, retryAfterSeconds?, details? }\`. Branch on \`code\`, not \`message\`.

- A validation \`400\` has \`details\` (field name to messages). A body that is not valid JSON gives "Malformed JSON body" with no \`details\`.
- \`RATE_LIMITED\` (\`429\`) has no \`retryAfterSeconds\`; read the \`RateLimit\` response headers instead.
- \`OTP_LOCKED\` (\`429\`) has \`retryAfterSeconds\` and a \`Retry-After\` header.
- Every \`/api/auth\` route shares a limit of 100 requests per 15 minutes per IP. Some routes have a stricter one, shown on the route.
- \`413\` means the body is over 100 kB.`,
  },
  servers: [{ url: "/", description: "This server" }],
  tags: [
    { name: "System", description: "Server status." },
    {
      name: "Auth",
      description:
        "Registration, email verification, login with a one-time code, sessions and password recovery.",
    },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "The `accessToken` from verify-otp or refresh.",
      },
    },
  },
  paths: {
    ...healthPaths,
    ...authPaths,
  },
});
