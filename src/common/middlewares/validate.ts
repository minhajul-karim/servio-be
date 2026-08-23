import { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { AppError } from "../errors/app-error";

export function validate(schema: z.ZodType, source: "body" | "query" | "params" = "body") {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const parsed = schema.safeParse(req[source]);

    if (!parsed.success) {
      next(new AppError(400, JSON.stringify(z.flattenError(parsed.error).fieldErrors)));
      return;
    }

    req[source] = parsed.data;
    next();
  };
}
