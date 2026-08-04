-- CreateTable
CREATE TABLE "PreviousYearQuestion" (
    "id" TEXT NOT NULL,
    "examCode" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "session" TEXT,
    "subject" TEXT NOT NULL,
    "topic" TEXT,
    "questionText" TEXT NOT NULL,
    "optionA" TEXT,
    "optionB" TEXT,
    "optionC" TEXT,
    "optionD" TEXT,
    "correctAnswer" TEXT NOT NULL,
    "questionType" TEXT NOT NULL DEFAULT 'mcq_single',
    "marksCorrect" DOUBLE PRECISION NOT NULL DEFAULT 4,
    "marksIncorrect" DOUBLE PRECISION NOT NULL DEFAULT -1,
    "solution" TEXT,
    "solutionModel" TEXT,
    "diagramSvg" TEXT,
    "sourceUrl" TEXT,
    "sourceNote" TEXT,
    "questionHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PreviousYearQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseRequest" (
    "id" TEXT NOT NULL,
    "examName" TEXT NOT NULL,
    "email" TEXT,
    "userId" TEXT,
    "note" TEXT,
    "votes" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PreviousYearQuestion_examCode_year_idx" ON "PreviousYearQuestion"("examCode", "year");

-- CreateIndex
CREATE INDEX "PreviousYearQuestion_examCode_subject_idx" ON "PreviousYearQuestion"("examCode", "subject");

-- CreateIndex
CREATE UNIQUE INDEX "PreviousYearQuestion_examCode_questionHash_key" ON "PreviousYearQuestion"("examCode", "questionHash");

-- CreateIndex
CREATE INDEX "CourseRequest_status_idx" ON "CourseRequest"("status");

