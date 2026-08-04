-- AlterTable
ALTER TABLE "PreviousYearQuestion" ADD COLUMN     "answerNote" TEXT,
ADD COLUMN     "chapter" TEXT,
ADD COLUMN     "chapterId" TEXT,
ADD COLUMN     "dateLabel" TEXT,
ADD COLUMN     "diagramImage" TEXT,
ADD COLUMN     "diagramSource" TEXT,
ADD COLUMN     "figureHint" TEXT,
ADD COLUMN     "languages" TEXT[] DEFAULT ARRAY['en']::TEXT[],
ADD COLUMN     "needsFigure" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "paperDate" DATE,
ADD COLUMN     "paperId" TEXT,
ADD COLUMN     "paperQuestionNumber" INTEGER,
ADD COLUMN     "questionNumber" INTEGER,
ADD COLUMN     "section" TEXT,
ADD COLUMN     "sessionLabel" TEXT,
ADD COLUMN     "sessionNumber" INTEGER,
ADD COLUMN     "shift" INTEGER,
ADD COLUMN     "shiftLabel" TEXT,
ADD COLUMN     "shiftTime" TEXT,
ADD COLUMN     "solutionQuality" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'ok',
ADD COLUMN     "stream" TEXT,
ADD COLUMN     "subjectId" TEXT,
ALTER COLUMN "correctAnswer" DROP NOT NULL;

-- CreateTable
CREATE TABLE "PyqPaper" (
    "id" TEXT NOT NULL,
    "examCode" TEXT NOT NULL,
    "examName" TEXT NOT NULL,
    "stream" TEXT,
    "year" INTEGER NOT NULL,
    "sessionNumber" INTEGER,
    "sessionLabel" TEXT,
    "paperDate" DATE,
    "dateLabel" TEXT,
    "shift" INTEGER,
    "shiftLabel" TEXT,
    "shiftTime" TEXT,
    "durationMinutes" INTEGER NOT NULL DEFAULT 180,
    "totalQuestions" INTEGER NOT NULL DEFAULT 90,
    "totalMarks" INTEGER NOT NULL DEFAULT 300,
    "marksCorrect" DOUBLE PRECISION NOT NULL DEFAULT 4,
    "marksIncorrect" DOUBLE PRECISION NOT NULL DEFAULT -1,
    "subjectCounts" JSONB NOT NULL DEFAULT '{}',
    "needsFigureCount" INTEGER NOT NULL DEFAULT 0,
    "languages" TEXT[] DEFAULT ARRAY['en']::TEXT[],
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PyqPaper_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PyqPaper_examCode_year_idx" ON "PyqPaper"("examCode", "year");

-- CreateIndex
CREATE INDEX "PyqPaper_isPublished_idx" ON "PyqPaper"("isPublished");

-- CreateIndex
CREATE UNIQUE INDEX "PyqPaper_examCode_year_paperDate_shift_key" ON "PyqPaper"("examCode", "year", "paperDate", "shift");

-- CreateIndex
CREATE INDEX "PreviousYearQuestion_examCode_year_paperDate_shift_idx" ON "PreviousYearQuestion"("examCode", "year", "paperDate", "shift");

-- CreateIndex
CREATE INDEX "PreviousYearQuestion_examCode_subject_chapterId_idx" ON "PreviousYearQuestion"("examCode", "subject", "chapterId");

-- CreateIndex
CREATE INDEX "PreviousYearQuestion_paperId_paperQuestionNumber_idx" ON "PreviousYearQuestion"("paperId", "paperQuestionNumber");

