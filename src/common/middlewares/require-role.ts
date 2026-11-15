import { NextFunction, Request, Response } from "express";
import { AppError } from "../errors/app-error";
import { Role } from "../../generated/prisma/enums";

export function requireRole(...allowedRoles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      next(new AppError(403, "Forbidden"));
      return;
    }

    next();
  };
}
