import { UserType } from "../../generated/prisma/enums";

declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        userType: UserType;
      };
    }
  }
}

export {};
