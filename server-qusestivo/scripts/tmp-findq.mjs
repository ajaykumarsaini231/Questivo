import prisma from "../src/prismaClient.js";

const rows = await prisma.previousYearQuestion.findMany({
  where: { examCode: "GATE_MT", questionNumber: { in: [3, 29] } },
  select: {
    id: true, year: true, paperId: true, subject: true, topic: true,
    questionNumber: true, section: true, questionText: true,
    correctAnswer: true, status: true, questionType: true,
    questionImage: true, optionAImage: true, optionBImage: true,
    optionCImage: true, optionDImage: true, solutionImage: true,
    questionNeedsImage: true, questionContentKind: true,
  },
  orderBy: [{ year: "asc" }, { questionNumber: "asc" }],
});
for (const r of rows) {
  console.log(
    `${r.paperId} Q${r.questionNumber} [${r.topic ?? "-"}] key=${r.correctAnswer} status=${r.status} kind=${r.questionContentKind}`
  );
  console.log(`   text: ${JSON.stringify((r.questionText || "").slice(0, 160))}`);
  console.log(`   qImg: ${r.questionImage}`);
  console.log(`   opts: ${[r.optionAImage, r.optionBImage, r.optionCImage, r.optionDImage].join(" | ")}`);
  console.log(`   sol : ${r.solutionImage}`);
}
await prisma.$disconnect();
