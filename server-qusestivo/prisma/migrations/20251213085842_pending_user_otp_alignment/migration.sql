/*
  Warnings:

  - The values [OTP,GITHUB] on the enum `AuthProvider` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `otp` on the `PendingUser` table. All the data in the column will be lost.
  - You are about to drop the column `otpExpiry` on the `PendingUser` table. All the data in the column will be lost.
  - You are about to drop the column `password` on the `PendingUser` table. All the data in the column will be lost.
  - Added the required column `otpExpiresAt` to the `PendingUser` table without a default value. This is not possible if the table is not empty.
  - Added the required column `otpHash` to the `PendingUser` table without a default value. This is not possible if the table is not empty.
  - Added the required column `passwordHash` to the `PendingUser` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "AuthProvider_new" AS ENUM ('LOCAL', 'GOOGLE', 'FACEBOOK');
ALTER TABLE "public"."User" ALTER COLUMN "authProvider" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "authProvider" TYPE "AuthProvider_new" USING ("authProvider"::text::"AuthProvider_new");
ALTER TYPE "AuthProvider" RENAME TO "AuthProvider_old";
ALTER TYPE "AuthProvider_new" RENAME TO "AuthProvider";
DROP TYPE "public"."AuthProvider_old";
ALTER TABLE "User" ALTER COLUMN "authProvider" SET DEFAULT 'LOCAL';
COMMIT;

-- AlterEnum
ALTER TYPE "OtpPurpose" ADD VALUE 'SIGNUP';

-- AlterTable
ALTER TABLE "PendingUser" DROP COLUMN "otp",
DROP COLUMN "otpExpiry",
DROP COLUMN "password",
ADD COLUMN     "otpExpiresAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "otpHash" TEXT NOT NULL,
ADD COLUMN     "passwordHash" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "authProvider" SET DEFAULT 'LOCAL';
