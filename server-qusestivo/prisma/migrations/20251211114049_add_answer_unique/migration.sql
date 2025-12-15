/*
  Warnings:

  - A unique constraint covering the columns `[sessionId,questionId]` on the table `TestAnswer` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "TestAnswer_sessionId_questionId_key" ON "TestAnswer"("sessionId", "questionId");
