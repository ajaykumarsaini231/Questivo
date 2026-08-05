-- CreateTable
CREATE TABLE "OtpThrottle" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "lastSentAt" TIMESTAMP(3) NOT NULL,
    "sendCount" INTEGER NOT NULL DEFAULT 0,
    "strikes" INTEGER NOT NULL DEFAULT 0,
    "blockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OtpThrottle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- The lock target. Every OTP request selects exactly one row by this key
-- FOR UPDATE, so it has to be unique and indexed or the limiter serialises on
-- a sequential scan.
CREATE UNIQUE INDEX "OtpThrottle_identifier_purpose_key" ON "OtpThrottle"("identifier", "purpose");

-- CreateIndex
CREATE INDEX "OtpThrottle_blockedUntil_idx" ON "OtpThrottle"("blockedUntil");

-- CreateIndex
CREATE INDEX "OtpThrottle_updatedAt_idx" ON "OtpThrottle"("updatedAt");
