// Google Drive diagram lookup.
//
// Flow, as specified:
//
//     AI generates question
//            |
//     needs a diagram?  --no--> (no figure)
//            | yes
//     search Drive for a matching image
//            |
//     found? --no--> fall back to model-generated SVG
//            | yes
//     download it, attach to the question
//
// Why Drive first: a real diagram drawn by a teacher beats anything a language
// model draws. The SVG path stays as the fallback so questions still get a
// figure when Drive has nothing.
//
// Requires drive.readonly on GOOGLE_REFRESH_TOKEN. Run
//   node scripts/googleRefreshToken.mjs
// if the scope is missing — the whole module degrades to "no match" without it,
// it never throws into the generation pipeline.

import fs from "node:fs";
import path from "node:path";

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;

/** Optional: restrict search to one folder id, e.g. a "Question Diagrams" folder. */
const FOLDER_ID = process.env.DRIVE_DIAGRAM_FOLDER_ID || "";
const ENABLED = process.env.DRIVE_DIAGRAMS_ENABLED !== "false";
/** Drive images above this are skipped — they bloat the question payload. */
const MAX_BYTES = Number(process.env.DRIVE_DIAGRAM_MAX_BYTES || 400_000);
const CACHE_DIR = path.join(process.cwd(), ".cache", "drive-diagrams");

let accessToken = null;
let accessTokenExpiry = 0;
/** Set once Drive has told us the scope is missing, so we stop asking. */
let driveUnavailableReason = null;

async function getAccessToken() {
  if (accessToken && Date.now() < accessTokenExpiry - 30_000) return accessToken;
  if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
    driveUnavailableReason = "Google OAuth env vars are not set";
    return null;
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  const body = await res.json();
  if (!res.ok) {
    driveUnavailableReason = `${body.error}: ${body.error_description || ""}`.trim();
    console.warn(`[Drive] token refresh failed — ${driveUnavailableReason}`);
    return null;
  }
  accessToken = body.access_token;
  accessTokenExpiry = Date.now() + (body.expires_in || 3600) * 1000;
  return accessToken;
}

/**
 * Turn a question into a Drive search phrase.
 *
 * Drive's `fullText contains` matches file names and content, so this leans on
 * the topic plus a few distinctive nouns from the question rather than the
 * whole sentence, which would match nothing.
 */
export function buildSearchTerms(topic, questionText = "") {
  const STOP = new Set(
    ("the a an of in on at to for from with and or is are was were be been what which " +
      "if then find given calculate determine value figure shown following question " +
      "consider assume respectively between into that this these those when where how")
      .split(" ")
  );
  const words = String(questionText)
    .replace(/\\\(.*?\\\)/g, " ") // drop inline LaTeX
    .replace(/[^a-zA-Z\s]/g, " ")
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 4 && !STOP.has(w));

  // Most distinctive words first, capped — long queries return nothing.
  const freq = new Map();
  for (const w of words) freq.set(w, (freq.get(w) || 0) + 1);
  const keywords = [...new Set(words)]
    .sort((a, b) => (freq.get(b) - freq.get(a)) || b.length - a.length)
    .slice(0, 3);

  return [topic, ...keywords].filter(Boolean);
}

/** Escape a value for Drive's query language (single quotes are the delimiter). */
const q = (s) => String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'");

/**
 * Search Drive for an image matching the topic/question.
 * @returns {Promise<{id,name,mimeType,size}|null>}
 */
export async function searchDriveDiagram(topic, questionText) {
  if (!ENABLED || driveUnavailableReason) return null;
  const token = await getAccessToken();
  if (!token) return null;

  const terms = buildSearchTerms(topic, questionText);
  if (!terms.length) return null;

  // Try the most specific phrase first, then widen to just the topic.
  const attempts = [terms.join(" "), terms.slice(0, 2).join(" "), terms[0]];

  for (const phrase of [...new Set(attempts)]) {
    const clauses = [
      `fullText contains '${q(phrase)}'`,
      "mimeType contains 'image/'",
      "trashed = false",
    ];
    if (FOLDER_ID) clauses.push(`'${q(FOLDER_ID)}' in parents`);

    const url =
      "https://www.googleapis.com/drive/v3/files?" +
      new URLSearchParams({
        q: clauses.join(" and "),
        fields: "files(id,name,mimeType,size)",
        pageSize: "5",
        orderBy: "modifiedTime desc",
      });

    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const reason = err?.error?.message || `HTTP ${res.status}`;
      // A scope problem will not fix itself; stop trying for this process.
      if (res.status === 403 || res.status === 401) {
        driveUnavailableReason = reason;
        console.warn(`[Drive] search disabled — ${reason}`);
      }
      return null;
    }
    const { files = [] } = await res.json();
    const usable = files.find((f) => !f.size || Number(f.size) <= MAX_BYTES);
    if (usable) {
      console.log(`[Drive] matched "${usable.name}" for "${phrase}"`);
      return usable;
    }
  }
  return null;
}

/**
 * Download a Drive file and return it as a data URI, ready to drop straight
 * into an <img src>. Cached on disk so a repeated topic does not re-download.
 */
export async function downloadDriveImage(file) {
  const token = await getAccessToken();
  if (!token) return null;

  const cached = path.join(CACHE_DIR, `${file.id}.b64`);
  try {
    if (fs.existsSync(cached)) return fs.readFileSync(cached, "utf8");
  } catch {
    /* cache is best-effort */
  }

  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}?alt=media`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) {
    console.warn(`[Drive] download failed for ${file.name}: HTTP ${res.status}`);
    return null;
  }

  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength > MAX_BYTES) {
    console.warn(`[Drive] ${file.name} is ${buf.byteLength}B, over the ${MAX_BYTES}B cap`);
    return null;
  }

  const mime = file.mimeType || "image/png";
  const dataUri = `data:${mime};base64,${buf.toString("base64")}`;
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(cached, dataUri);
  } catch {
    /* cache is best-effort */
  }
  return dataUri;
}

/**
 * The whole flow in one call: search, download, return an attachable image.
 * Returns null whenever Drive cannot help, so the caller falls back to SVG.
 */
export async function findDiagramInDrive(topic, questionText) {
  try {
    const file = await searchDriveDiagram(topic, questionText);
    if (!file) return null;
    const dataUri = await downloadDriveImage(file);
    if (!dataUri) return null;
    return { dataUri, name: file.name, fileId: file.id };
  } catch (err) {
    // Never let a Drive problem break question generation.
    console.warn(`[Drive] lookup error: ${err.message}`);
    return null;
  }
}

export const driveStatus = () => ({
  enabled: ENABLED,
  configured: Boolean(CLIENT_ID && CLIENT_SECRET && REFRESH_TOKEN),
  folderScoped: Boolean(FOLDER_ID),
  unavailableReason: driveUnavailableReason,
});
