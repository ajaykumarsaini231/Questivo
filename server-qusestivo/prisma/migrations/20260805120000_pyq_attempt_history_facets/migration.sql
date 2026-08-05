-- AlterTable
--
-- Every column is nullable or defaulted: the six attempts already stored were
-- all real papers sat before generated ones existed, so the defaults describe
-- them correctly and no backfill is needed.
ALTER TABLE "PyqAttempt" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'pyq',
ADD COLUMN     "sessionLabel" TEXT,
ADD COLUMN     "dateLabel" TEXT,
ADD COLUMN     "shiftLabel" TEXT,
ADD COLUMN     "subject" TEXT,
ADD COLUMN     "questionIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "totalQuestions" INTEGER,
ADD COLUMN     "spec" JSONB;

-- CreateIndex
CREATE INDEX "PyqAttempt_userId_kind_createdAt_idx" ON "PyqAttempt"("userId", "kind", "createdAt");
