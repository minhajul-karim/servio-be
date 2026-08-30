/*
  Warnings:

  - You are about to drop the column `user_type` on the `users` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'COMPANY_OWNER', 'STAFF', 'CUSTOMER');

-- AlterTable
ALTER TABLE "users" DROP COLUMN "user_type",
ADD COLUMN     "role" "Role" NOT NULL DEFAULT 'CUSTOMER';

-- DropEnum
DROP TYPE "UserType";
