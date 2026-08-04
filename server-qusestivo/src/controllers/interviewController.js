import prisma from "../prismaClient.js";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse-fork");

/**
 * Helper Matrix: Extracts raw plaintext tokens directly from uploaded document binary buffers
 */
async function extractTextFromBuffer(buffer, mimetype) {
  try {
    if (mimetype === "application/pdf") {
      const data = await pdfParse(buffer);
      return data.text;
    } else if (
      mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || 
      mimetype === "application/msword"
    ) {
      return buffer.toString("utf-8").replace(/[^\x20-\x7E\t\n\r]/g, "");
    }
    return "Fallback generic baseline resume context tokens applied.";
  } catch (parseError) {
    console.error("❌ Document stream text extraction failure:", parseError);
    return "Extraction failure backup context markers mapping.";
  }
}

/**
 * Phase 1: Ingest multi-part form data payload streams and compile transaction locks inside DB
 * Route: POST /api/interview/initialize
 */
export const initializeInterviewSession = async (req, res) => {
  try {
    // Access string variables mapped natively via multer multipart parsing boundaries
    const { role, experience, jobDescription, sessionId } = req.body;

    console.log("=====================================================");
    console.log(`[Groq Ingress Log] Body Keys:`, { role, experience, sessionId });
    console.log(`[Groq Ingress Log] Uploaded File Structure:`, req.file);
    console.log("=====================================================");

    // Strict validation mapping check blocks
    if (!role || !experience || !req.file) {
      return res.status(400).json({
        error: `Validation Failed: Missing required payload tokens. role: ${!!role}, experience: ${!!experience}, file: ${!!req.file}`
      });
    }

    // Step A: Parse raw plaintext snapshot data array out of the file buffer stream
    const rawResumeTextSnapshot = await extractTextFromBuffer(req.file.buffer, req.file.mimetype);
    // req.user is never populated on this route; optionalAuth sets req.userId.
    // The old fallback filed every interview under one shared fake user, so no
    // one could ever list their own sessions.
    const userId = req.userId || req.user?.id || `anon:${req.ip || "unknown"}`;
    
    // Normalize properties strictly to block invalid null references inside Prisma layer
    const finalRole = String(role).trim();
    const finalExperience = String(experience).trim();
    const finalJobDesc = String(jobDescription || "Standard corporate profile benchmarks applied dynamically.").trim();
    const targetSessionId = String(sessionId || `session-${Math.random().toString(36).substring(2, 9)}`).trim();

    // Step B: Atomically sync execution criteria records into PostgreSQL via Prisma engine locks
    const interviewSession = await prisma.interviewSession.upsert({
      where: { id: targetSessionId },
      update: {
        targetRole: finalRole,
        experienceLevel: finalExperience,
        jobDescription: finalJobDesc,
        resumeSnapshot: rawResumeTextSnapshot,
        status: "active"
      },
      create: {
        id: targetSessionId,
        userId: userId,
        targetCompany: "Generic",
        targetRole: finalRole,
        experienceLevel: finalExperience,
        jobDescription: finalJobDesc,
        resumeSnapshot: rawResumeTextSnapshot,
        status: "active"
      }
    });

    console.log(`💾 [Prisma Dynamic Lock]: Row session entries persistently updated: ${interviewSession.id}`);

    return res.status(200).json({
      success: true,
      message: "AI Voice Interview Session successfully initialized inside database maps",
      sessionId: interviewSession.id
    });

  } catch (err) {
    console.error("❌ [Interview Initializer Backend Core Failure]:", err);
    return res.status(500).json({ error: err.message || "Internal core structural pipeline exception layers" });
  }
};

/**
 * Phase 2: Fetch current conversation status summaries and configuration details logs
 * Route: GET /api/interview/session/:sessionId
 */
export const getInterviewSessionDetails = async (req, res) => {
  try {
    const { sessionId } = req.params;

    const sessionDetails = await prisma.interviewSession.findUnique({
      where: { id: sessionId },
      include: {
        messages: {
          orderBy: { createdAt: "asc" }
        }
      }
    });

    if (!sessionDetails) {
      return res.status(404).json({ error: "Active interview target parameters not matched or expired." });
    }

    return res.status(200).json({
      success: true,
      data: sessionDetails
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
/**
 * A user's past interview sessions.
 *
 * Summary only — the transcript can be long, and the list view does not need
 * it. Scoped to the caller so session ids cannot be enumerated.
 */
export const getInterviewHistory = async (req, res) => {
  if (!req.userId) {
    return res.status(200).json({ success: true, data: [], anonymous: true });
  }
  try {
    const sessions = await prisma.interviewSession.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        targetRole: true,
        targetCompany: true,
        experienceLevel: true,
        durationMinutes: true,
        status: true,
        createdAt: true,
        evaluation: {
          select: {
            overallScore: true,
            technicalScore: true,
            communicationScore: true,
            problemSolving: true,
          },
        },
        _count: { select: { messages: true } },
      },
    });
    return res.status(200).json({ success: true, data: sessions });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

/**
 * Full transcript of one past interview: every question the AI asked and every
 * answer the candidate gave, in order, plus the scored feedback.
 *
 * The messages were already being written during the live session, so nothing
 * new is stored to support this — it only exposes what was there.
 */
export const getInterviewTranscript = async (req, res) => {
  try {
    const session = await prisma.interviewSession.findUnique({
      where: { id: req.params.sessionId },
      include: {
        messages: { orderBy: { createdAt: "asc" } },
        evaluation: true,
      },
    });
    if (!session) return res.status(404).json({ error: "Session not found" });
    if (!req.userId || session.userId !== req.userId) {
      return res.status(403).json({ error: "Not your interview" });
    }
    // resumeSnapshot is the candidate's full parsed CV; it is not needed to
    // review a transcript, so it is not sent back.
    const { resumeSnapshot, ...safe } = session;
    return res.status(200).json({ success: true, data: safe });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
