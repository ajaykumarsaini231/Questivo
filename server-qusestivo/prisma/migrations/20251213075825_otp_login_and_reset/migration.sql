-- CreateEnum
CREATE TYPE "OtpPurpose" AS ENUM ('LOGIN', 'RESET_PASSWORD');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "otpPurpose" "OtpPurpose",
ADD COLUMN     "photoUrl" TEXT,
ADD COLUMN     "role" TEXT NOT NULL DEFAULT 'user',
ALTER COLUMN "isVerified" SET DEFAULT true;
