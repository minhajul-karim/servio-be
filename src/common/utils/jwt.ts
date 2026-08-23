import jwt from "jsonwebtoken";
import { env } from "../../env";
import { UserType } from "../../generated/prisma/enums";

export function signToken(payload: { userId: string; userType: UserType }): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '15m'
  });
}

export function verifyToken(token: string): { userId: string; userType: UserType } {
  return jwt.verify(token, env.JWT_SECRET) as { userId: string; userType: UserType };
}