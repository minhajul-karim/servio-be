import { Options, rateLimit } from "express-rate-limit";
import { AppError } from "../errors/app-error";

const FIFTEEN_MINUTES_IN_MS = 15 * 60 * 1000;
const ONE_HOUR_IN_MS = 60 * 60 * 1000;

function createLimiter(options: Partial<Options>) {
  return rateLimit({
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (_req, _res, next) => {
      next(
        new AppError(429, "Too many requests, please try again later", undefined, "RATE_LIMITED"),
      );
    },
    ...options,
  });
}

export const generalRequestLimiter = createLimiter({ windowMs: FIFTEEN_MINUTES_IN_MS, limit: 100 });

export const loginBruteForceLimiter = createLimiter({
  windowMs: FIFTEEN_MINUTES_IN_MS,
  limit: 10,
  skipSuccessfulRequests: true,
});

export const emailSendingLimiter = createLimiter({ windowMs: ONE_HOUR_IN_MS, limit: 10 });
