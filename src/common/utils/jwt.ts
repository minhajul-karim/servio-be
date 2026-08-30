import jwt from "jsonwebtoken";
import { env } from "../../env";
import { Role } from "../../generated/prisma/enums";

export function signToken(payload: { userId: string; role: Role }): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '15m'
  });
}

export function verifyToken(token: string): { userId: string; role: Role } {
  return jwt.verify(token, env.JWT_SECRET) as { userId: string; role: Role };
}