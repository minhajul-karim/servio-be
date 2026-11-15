import { NextFunction, Request, Response } from "express";
import { Prisma } from "../../generated/prisma/client";
import { AppError } from "../errors/app-error";

function bodyParserErrorType(err: unknown): string | undefined {
  if (typeof err === "object" && err !== null && "type" in err && typeof err.type === "string") {
    return err.type;
  }

  return undefined;
}

function isExposedClientError(err: unknown): err is { status: number; message: string } {
  return (
    typeof err === "object" &&
    err !== null &&
    "expose" in err &&
    err.expose === true &&
    "status" in err &&
    typeof err.status === "number" &&
    err.status >= 400 &&
    err.status <= 499 &&
    "message" in err &&
    typeof err.message === "string"
  );
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    if (err.retryAfterSeconds !== undefined) {
      res.setHeader("Retry-After", String(err.retryAfterSeconds));
    }
    res.status(err.statusCode).json({
      message: err.message,
      ...(err.code && { code: err.code }),
      ...(err.retryAfterSeconds !== undefined && { retryAfterSeconds: err.retryAfterSeconds }),
      ...(err.details && { details: err.details }),
    });
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    res.status(409).json({ message: "A record with this value already exists" });
    return;
  }

  const bodyErrorType = bodyParserErrorType(err);

  if (bodyErrorType === "entity.parse.failed") {
    res.status(400).json({ message: "Malformed JSON body" });
    return;
  }

  if (bodyErrorType === "entity.too.large") {
    res.status(413).json({ message: "Request body too large" });
    return;
  }

  if (bodyErrorType !== undefined && isExposedClientError(err)) {
    res.status(err.status).json({ message: err.message });
    return;
  }

  console.error(err);
  res.status(500).json({ message: "Internal server error" });
}
