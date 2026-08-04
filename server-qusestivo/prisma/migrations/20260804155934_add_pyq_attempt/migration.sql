-- CreateTable
CREATE TABLE "PyqAttempt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "paperId" TEXT NOT NULL,
    "examCode" TEXT NOT NULL,
    "examName" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "label" TEXT,
    "score" INTEGER NOT NULL,
    "totalMarks" INTEGER NOT NULL,
    "percent" INTEGER NOT NULL,
    "correct" INTEGER NOT NULL,
    "wrong" INTEGER NOT NULL,
    "unattempted" INTEGER NOT NULL,
    "timeTakenSeconds" INTEGER,
    "responses" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PyqAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PyqAttempt_userId_createdAt_idx" ON "PyqAttempt"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "PyqAttempt_paperId_idx" ON "PyqAttempt"("paperId");

-- AddForeignKey
ALTER TABLE "PyqAttempt" ADD CONSTRAINT "PyqAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
