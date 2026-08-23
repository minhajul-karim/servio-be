import { NextFunction, Request, Response } from "express";
import { AppError } from "../errors/app-error";
import { UserType } from "../../generated/prisma/enums";

export function requireUserType(...allowedUserTypes: UserType[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user || !allowedUserTypes.includes(req.user.userType)) {
      next(new AppError(403, "Forbidden"));
      return;
    }

    next();
  };
}
