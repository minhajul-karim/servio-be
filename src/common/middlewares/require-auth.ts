import { NextFunction, Request, Response } from "express";
import { AppError } from "../errors/app-error";
import { verifyToken } from "../utils/jwt";

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    next(new AppError(401, "Missing or malformed Authorization header"));
    return;
  }

  const token = header.slice("Bearer ".length);

  try {
    req.user = verifyToken(token);
    next();
  } catch {
    next(new AppError(401, "Invalid or expired token"));
  }
}
