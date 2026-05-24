import { analyzeResumeAgent } from "../agentic-mock-test/resumeAnalyzer.js";
import prisma from "../prismaClient.js";

import { createRequire } from "module";
const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse-fork");

async function extractTextFromBuffer(buffer, mimetype) {
  if (mimetype === "application/pdf") {
    const data = await pdfParse(buffer);
    return data.text;
  }
  return buffer.toString("utf-8").replace(/[^\x20-\x7E\t\n\r]/g, "");
}

export const uploadAndAnalyzeResume = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Missing file" });
    const { company, role, experience, jobDescription } = req.body;
    
    const rawResumeText = await extractTextFromBuffer(req.file.buffer, req.file.mimetype);
    const reportAnalysis = await analyzeResumeAgent({ resumeText: rawResumeText, jobDescription, targetRole: role, experienceLevel: experience });

    const savedRecord = await prisma.resumeAnalysis.create({
      data: {
        userId: "anonymous-session-layer",
        fileName: req.file.originalname,
        targetCompany: company || "Generic",
        targetRole: role,
        experienceLevel: experience,
        jobDescription: jobDescription || "",
        overallScore: Number(reportAnalysis.overallScore) || 0,
        matchPercentage: Number(reportAnalysis.matchPercentage) || 0,
        radarMetrics: reportAnalysis.radarMetrics || {},
        strengths: reportAnalysis.strengths || [],
        weaknesses: reportAnalysis.weaknesses || [],
        missingSkills: reportAnalysis.missingSkills || [],
        
        // Structured JSON container to bypass unknown argument errors
        lintChecks: {
          ...reportAnalysis.lintChecks,
          sections: reportAnalysis.sections,
          skillAnalysis: reportAnalysis.skillAnalysis,
          roleAlignment: reportAnalysis.roleAlignment,
          projectEvaluation: reportAnalysis.projectEvaluation,
          experienceEvaluation: reportAnalysis.experienceEvaluation,
          keywordAnalysis: reportAnalysis.keywordAnalysis,
          formatting: reportAnalysis.formatting,
          readability: reportAnalysis.readability,
          companySimulation: reportAnalysis.companySimulation,
          improvements: reportAnalysis.improvements,
          rewrittenBullets: reportAnalysis.rewrittenBullets,
          interviewProbability: reportAnalysis.interviewProbability,
          finalVerdict: reportAnalysis.finalVerdict
        },

        // Flattened suggestions to match Prisma model
        suggestions: {
          bulletRewrites: reportAnalysis.suggestions?.bulletRewrites || reportAnalysis.rewrittenBullets?.map(b => b.improved) || [],
          projectImprovements: reportAnalysis.suggestions?.projectImprovements || reportAnalysis.improvements?.projectRecommendations || [],
          metricAdditions: reportAnalysis.suggestions?.metricAdditions || reportAnalysis.improvements?.highImpactChanges || [],
          resumeOptimization: reportAnalysis.suggestions?.resumeOptimization || reportAnalysis.improvements?.resumeOptimization || "Optimize metrics."
        }
      }
    });

    return res.status(200).json({ success: true, data: savedRecord });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
};

export const getAnalysisHistory = async (req, res) => {
  const history = await prisma.resumeAnalysis.findMany({ orderBy: { createdAt: "desc" } });
  return res.status(200).json({ success: true, data: history });
};