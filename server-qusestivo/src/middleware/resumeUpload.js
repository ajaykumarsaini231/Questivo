/**
 * The one multer configuration for resume uploads.
 *
 * There were two, and they disagreed. resumeRoutes.js capped a file at 10 MB;
 * interviewRoutes.js set no limit at all, so the same endpoint family accepted
 * a 10 MB resume on one route and an arbitrarily large one on the other —
 * straight into memory, from a caller who does not need an account, on a dyno
 * with a fixed heap. Neither checked what kind of file it was.
 *
 * WHY THE TYPE FILTER MATTERS MORE THAN IT LOOKS
 *
 * resumeController's extractTextFromBuffer parses application/pdf with
 * pdf-parse and treats EVERYTHING ELSE as UTF-8 text. So a .docx — a zip
 * archive — was decoded as text, producing a page of mojibake, which was then
 * sent to an AI provider as "the candidate's resume" and billed as such. The
 * user got a confident analysis of nothing. Refusing the upload with a clear
 * message is not a new restriction; it is telling the truth about what this
 * pipeline can read.
 */

import multer from "multer";

/** What extractTextFromBuffer can actually turn into resume text. */
const ACCEPTED = new Set(["application/pdf", "text/plain"]);

/**
 * 5 MB, down from 10 and from unlimited.
 *
 * A resume is a page or two. Ten megabytes is not a resume; it is a scan of one
 * at a resolution nobody needs, and the parse cost scales with it. This still
 * clears any real CV by a wide margin.
 */
const MAX_BYTES = Number(process.env.RESUME_MAX_BYTES) || 5 * 1024 * 1024;

export const resumeUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_BYTES,
    // One file, one field. Without these a caller can send thousands of tiny
    // parts that each pass the size check while the request as a whole does not.
    files: 1,
    fields: 10,
    parts: 20,
  },
  fileFilter(_req, file, cb) {
    if (ACCEPTED.has(file.mimetype)) return cb(null, true);
    const err = new Error(
      "Please upload your resume as a PDF or a plain text file."
    );
    err.statusCode = 400;
    err.isOperational = true;
    cb(err);
  },
});

/**
 * Turn multer's own failures into the JSON the frontend expects.
 *
 * A rejected upload otherwise arrives at the error handler as a MulterError
 * with no statusCode, which reports it as a 500 "something went wrong" — so a
 * user who attached a 40 MB scan was told the server was broken rather than
 * that their file was too big. Mounted immediately after the upload middleware
 * on each route.
 */
export function handleUploadErrors(err, _req, res, next) {
  if (!err) return next();

  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({
      success: false,
      error: `That file is too large. Please upload a resume under ${Math.round(
        MAX_BYTES / (1024 * 1024)
      )} MB.`,
    });
  }

  if (err.statusCode === 400 || err.name === "MulterError") {
    return res.status(400).json({
      success: false,
      error: err.message || "That file could not be accepted.",
    });
  }

  return next(err);
}
