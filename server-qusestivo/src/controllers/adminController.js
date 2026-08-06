import bcrypt from "bcryptjs";
import prisma from "../prismaClient.js";
import { sanitizeSvg } from "../lib/sanitizeSvg.js";
import { FEATURE_KEYS, isFeatureKey } from "../lib/entitlements.js";

/**
 * Run any diagram in `data` through the SVG allow-list before it is stored.
 *
 * sanitizeSvg was written for model-generated diagrams and called from exactly
 * one place — questionGenerator.js — on the assumption that the model was the
 * only author of markup. It was not. `diagramSvg` is an editable field on this
 * endpoint, and four components render it with dangerouslySetInnerHTML
 * (PyqResultView, PyqSection, TestPage, PyqPaperRunner), so anything written
 * here executes in every reader's browser on the site's own origin.
 *
 * "Admins are trusted" is the wrong frame. It makes an admin session worth
 * stealing for the XSS it grants over every user, and it makes an
 * administrative mistake — pasting a figure from an unknown source — into a
 * site-wide compromise. The sanitiser is cheap and already written; the only
 * reason it was not applied to this path is that nobody joined the two facts.
 *
 * A diagram that does not survive sanitising is rejected rather than silently
 * blanked, so an admin finds out at the moment they save instead of discovering
 * an empty figure in a live paper.
 */
const sanitizeDiagram = (data) => {
  if (typeof data.diagramSvg !== "string" || !data.diagramSvg.trim()) return null;
  const clean = sanitizeSvg(data.diagramSvg);
  if (!clean) {
    return "That diagram could not be accepted: it is not a plain SVG drawing, or it contains scripts, event handlers or external references.";
  }
  data.diagramSvg = clean;
  return null;
};



export const verifyAdminAccess = async (req, res) => {
  res.status(200).json({ success: true, message: "Authorized", user: req.user });
};

export const getAdminStats = async (req, res) => {
  try {
    const [userCount, sessionCount, categoryCount] = await Promise.all([
      prisma.user.count(),
      prisma.testSession.count(),
      prisma.examCategory.count(),
    ]);
    
    res.json({ 
      success: true, 
      data: { users: userCount, sessions: sessionCount, categories: categoryCount } 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};


export const getUserDetails = async (req, res) => {
  try {
    // 1. LOG THE PARAMS to see what is coming in
    console.log("Incoming Params:", req.params);
    
    const { id } = req.params;
    
    // 2. Check if ID is valid before querying
    if (!id || id === 'undefined' || id === 'null') {
        console.log("Invalid ID received:", id);
        return res.status(400).json({ success: false, error: "Invalid User ID provided" });
    }

    const user = await prisma.user.findUnique({
      where: { id }, // This relies on the ID being exactly correct
      include: {
        sessions: {
          orderBy: { createdAt: 'desc' },
          include: { 
            examCategory: { select: { name: true } },
            _count: { select: { questions: true } }
          }
        }
      }
    });

    if (!user) {
        console.log(`User query returned null for ID: ${id}`);
        return res.status(404).json({ success: false, error: "User not found" });
    }

    // Strip every credential, not just the password.
    //
    // Dropping passwordHash alone still shipped otpHash, otpExpiresAt and
    // otpPurpose — which together are a live second factor. Anyone holding that
    // response can tell whether a login code is currently outstanding on the
    // account and, with the HMAC secret, verify guesses against it offline.
    const { passwordHash, otpHash, otpExpiresAt, otpPurpose, ...safeUser } = user;
    res.json({ success: true, data: safeUser });
  } catch (error) {
    console.error("Get User Details Error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/* ==========================================
   2. USER MANAGEMENT
   ========================================== */

export const createUser = async (req, res) => {
  try {
    const { 
      name, email, phone, password, role = "user", 
      authProvider = "LOCAL", isVerified = true, preferredMedium = "english" 
    } = req.body;

    if (!email) return res.status(400).json({ success: false, message: "Email is required" });

    // Check duplicates
    const existingUser = await prisma.user.findFirst({
      where: { OR: [{ email }, phone ? { phone } : undefined].filter(Boolean) },
    });

    if (existingUser) return res.status(409).json({ success: false, message: "User already exists" });

    // Hash password safely
    const passwordHash = password ? await bcrypt.hash(password, 10) : null;

    const user = await prisma.user.create({
      data: { name, email, phone, passwordHash, role, authProvider, isVerified, preferredMedium },
    });

    // Remove sensitive data from response
    const { passwordHash: _, ...safeUser } = user;
    res.status(201).json({ success: true, data: safeUser });

  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
};

// Optimized: Includes Pagination & Search
export const getAllUsers = async (req, res) => {
  try {
    const { page = 1, limit = 20, search = "" } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = search ? {
      OR: [
        { email: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } }
      ]
    } : {};

    const users = await prisma.user.findMany({
      where,
      skip: parseInt(skip),
      take: parseInt(limit),
      orderBy: { createdAt: 'desc' },
      select: {
        // SECURITY: Only select safe fields
        id: true, name: true, email: true, role: true,
        isVerified: true, createdAt: true, phone: true,
        // Drives the AI Access toggle in the table. Sent for every row so the
        // switch renders in its true position on first paint rather than
        // flicking across once a second request lands.
        entitlements: true,
        // The table renders these three and the edit modal loads its form from
        // the same row, so leaving them out of the select was not merely a blank
        // column: opening Edit read `bio` as undefined, the form defaulted it to
        // "", and saving wrote that empty string back over whatever was there.
        authProvider: true, preferredMedium: true, bio: true,
        _count: { select: { sessions: true } } // Show how many tests they took
      }
    });

    const total = await prisma.user.count({ where });

    res.json({ 
      success: true, 
      data: users, 
      meta: { total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) } 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to fetch users" });
  }
};

/**
 * Copy only the named keys across, dropping everything else on the floor.
 *
 * `undefined` is skipped rather than written, so a partial edit form patches
 * the fields it sent instead of nulling every field it left out.
 */
const pick = (body, fields) => {
  const out = {};
  for (const field of fields) {
    if (body?.[field] !== undefined) out[field] = body[field];
  }
  return out;
};

const TOPIC_EDITABLE_FIELDS = ["name", "code", "order", "isActive"];
const QUESTION_EDITABLE_FIELDS = [
  "examType", "topic", "difficulty", "questionText",
  "optionA", "optionB", "optionC", "optionD",
  "correctOption", "explanation", "diagramSvg", "diagramImage", "diagramSource", "topicId",
];

/**
 * Columns an admin may write through this endpoint.
 *
 * WHY AN ALLOW-LIST AND NOT A DENY-LIST
 *
 * This handler used to spread the whole request body into prisma.user.update.
 * Every column on User was therefore writable by anyone who reached it, which
 * is two separate escalations:
 *
 *   - `{"role":"superadmin"}` — any `admin` promotes themselves, or a
 *     colleague, past every check in adminIdentifier.
 *   - `{"otpHash":"<hmac of 000000>","otpPurpose":"LOGIN","otpExpiresAt":"…"}`
 *     — plant a known login code on ANY account, then sign in as that user.
 *     Full account takeover of every user on the site, including other admins.
 *
 * A deny-list would have to be updated every time a column is added to User,
 * and the day someone forgets is the day the hole reopens. An allow-list fails
 * the other way: a new column is simply not writable here until someone adds
 * it on purpose. Role changes are deliberately absent — granting roles is a
 * separate, audited action, not a field on the edit form.
 */
const USER_EDITABLE_FIELDS = ["name", "email", "phone", "bio", "photoUrl", "preferredMedium", "isVerified"];

export const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.body;

    const data = {};
    for (const field of USER_EDITABLE_FIELDS) {
      if (req.body[field] !== undefined) data[field] = req.body[field];
    }

    // If admin wants to reset password
    if (password) {
        data.passwordHash = await bcrypt.hash(password, 10);
        // A password the account holder did not choose invalidates any code
        // sitting on the row — otherwise a stale OTP is still a second way in
        // to an account that was just taken over administratively.
        data.otpHash = null;
        data.otpPurpose = null;
        data.otpExpiresAt = null;
    }

    if (!Object.keys(data).length) {
      return res.status(400).json({ success: false, error: "No editable fields supplied" });
    }

    const user = await prisma.user.update({
      where: { id },
      data,
      select: { id: true, name: true, email: true, role: true, isVerified: true } // Return safe data
    });

    res.json({ success: true, data: user });
  } catch (error) {
    res.status(400).json({ success: false, error: "Update failed. ID might be invalid." });
  }
};

/**
 * Grant or revoke one paid feature for one account.
 *
 * WHY THIS IS ITS OWN ENDPOINT AND NOT A FIELD ON THE EDIT FORM
 *
 * `entitlements` is deliberately absent from USER_EDITABLE_FIELDS above. The
 * edit form sends the whole object every time it is saved, so a list-valued
 * field on it would be rewritten wholesale by anyone who opened the form and
 * pressed Save — including by an older browser tab holding a stale copy, which
 * would silently revoke a grant made in the meantime. This endpoint changes one
 * key at a time and leaves the rest of the list where it was.
 *
 * It is also the action worth being able to find later. Granting metered
 * generation is a spending decision, so it is logged with who did it, and it is
 * a separate line in the audit trail rather than one field of a routine profile
 * edit.
 *
 * Available to `admin` as well as `superadmin`, matching every other route on
 * this router — a second, stricter rule here would be invisible until an admin
 * pressed the switch and it did nothing.
 *
 * Body: { feature: "aiGeneration", granted: true }
 */
export const setUserEntitlement = async (req, res) => {
  try {
    const { id } = req.params;
    const { feature, granted } = req.body ?? {};

    // An unknown key would be written happily by Postgres and then ignored by
    // every reader, so the admin would see a switch that saved and did nothing.
    if (!isFeatureKey(feature)) {
      return res.status(400).json({
        success: false,
        error: `Unknown feature. Expected one of: ${FEATURE_KEYS.join(", ")}`,
      });
    }
    // Not truthiness: `granted: "false"` from a hand-rolled request would
    // otherwise grant the feature, which is the wrong way for this to fail.
    if (typeof granted !== "boolean") {
      return res.status(400).json({ success: false, error: "`granted` must be true or false" });
    }

    const target = await prisma.user.findUnique({
      where: { id },
      select: { id: true, entitlements: true },
    });
    if (!target) return res.status(404).json({ success: false, error: "User not found" });

    const held = new Set(target.entitlements ?? []);
    if (granted) held.add(feature);
    else held.delete(feature);

    // Rebuild from FEATURE_KEYS rather than spreading the set: it fixes the
    // order, removes duplicates, and drops any key that has since been retired,
    // so the column cannot drift into holding things nothing reads.
    const next = FEATURE_KEYS.filter((key) => held.has(key));

    const user = await prisma.user.update({
      where: { id },
      data: { entitlements: next },
      select: { id: true, name: true, email: true, entitlements: true },
    });

    console.log(
      `[admin] ${req.user?.id} ${granted ? "granted" : "revoked"} "${feature}" ` +
        `${granted ? "to" : "from"} user ${id}`
    );

    res.json({ success: true, data: user });
  } catch (error) {
    console.error("Set User Entitlement Error:", error);
    res.status(500).json({ success: false, error: "Could not update access" });
  }
};

export const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.user.delete({ where: { id } });
    res.json({ success: true, message: "User deleted successfully" });
  } catch (error) {
    res.status(400).json({ success: false, error: "Delete failed" });
  }
};

export const getPendingUsers = async (req, res) => {
  try {
    // Usually we don't need pagination for pending users as they should be few
    //
    // `select`, not a bare findMany. PendingUser holds a bcrypt passwordHash
    // and the HMAC otpHash, and returning the row verbatim shipped both to the
    // browser: the password hash is then harvestable and crackable offline at
    // the attacker's leisure, and the OTP hash lets anyone who can open the
    // admin panel — or anyone who later reads that response out of a log, a
    // proxy or a browser cache — complete a signup they do not own.
    const pendingUsers = await prisma.pendingUser.findMany({
      orderBy: { createdAt: 'desc' },
      select: { email: true, name: true, otpExpiresAt: true, createdAt: true },
    });
    res.json({ success: true, data: pendingUsers });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const deletePendingUser = async (req, res) => {
  try {
    const { email } = req.params; // PendingUser ID is email
    await prisma.pendingUser.delete({ where: { email } });
    res.json({ success: true, message: "Pending request deleted" });
  } catch (error) {
    res.status(400).json({ success: false, error: "Delete failed" });
  }
};
/* ==========================================
   3. EXAM CATEGORY MANAGEMENT
   ========================================== */

export const createCategory = async (req, res) => {
  try {
    const { name, code, description, isActive } = req.body;
    const category = await prisma.examCategory.create({
      data: { name, code, description, isActive }
    });
    res.status(201).json({ success: true, data: category });
  } catch (error) {
    res.status(400).json({ success: false, error: "Category creation failed. Name/Code must be unique." });
  }
};

export const getAllCategories = async (req, res) => {
  try {
    const categories = await prisma.examCategory.findMany({
      include: { _count: { select: { topics: true, sessions: true } } }
    });
    res.json({ success: true, data: categories });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

/** See USER_EDITABLE_FIELDS for why these are allow-lists rather than spreads. */
const CATEGORY_EDITABLE_FIELDS = ["name", "code", "description", "isActive"];

export const updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const data = pick(req.body, CATEGORY_EDITABLE_FIELDS);
    if (!Object.keys(data).length) {
      return res.status(400).json({ success: false, error: "No editable fields supplied" });
    }
    const updated = await prisma.examCategory.update({ where: { id }, data });
    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(400).json({ success: false, error: "Update failed" });
  }
};

export const deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.examCategory.delete({ where: { id } });
    res.json({ success: true, message: "Category deleted" });
  } catch (error) {
    res.status(400).json({ success: false, error: "Delete failed" });
  }
};

/* ==========================================
   4. EXAM TOPIC MANAGEMENT
   ========================================== */

export const createTopic = async (req, res) => {
  try {
    const { examCategoryId, name, code, order, isActive } = req.body;
    const topic = await prisma.examTopic.create({
      data: { examCategoryId, name, code, order, isActive }
    });
    res.status(201).json({ success: true, data: topic });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};

// Filter topics by Category (Essential for Dropdowns)
export const getTopicsByCategory = async (req, res) => {
  try {
    const { categoryId } = req.params; 
    // Or req.query.categoryId depending on your route preference
    const where = categoryId ? { examCategoryId: categoryId } : {};
    
    const topics = await prisma.examTopic.findMany({
      where,
      orderBy: { order: 'asc' }
    });
    res.json({ success: true, data: topics });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const updateTopic = async (req, res) => {
  try {
    const { id } = req.params;
    const data = pick(req.body, TOPIC_EDITABLE_FIELDS);
    if (!Object.keys(data).length) {
      return res.status(400).json({ success: false, error: "No editable fields supplied" });
    }
    const updated = await prisma.examTopic.update({ where: { id }, data });
    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(400).json({ success: false, error: "Update failed" });
  }
};

export const deleteTopic = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.examTopic.delete({ where: { id } });
    res.json({ success: true, message: "Topic deleted" });
  } catch (error) {
    res.status(400).json({ success: false, error: "Delete failed" });
  }
};

/* ==========================================
   5. DATA INSPECTION (Sessions)
   ========================================== */

// PERFORMANCE FIX: View List Only (No Questions)
export const getAllSessions = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const sessions = await prisma.testSession.findMany({
      skip: parseInt(skip),
      take: parseInt(limit),
      orderBy: { createdAt: 'desc' },
      include: { 
        user: { select: { email: true, name: true } }, 
        examCategory: { select: { name: true } },
        _count: { select: { questions: true } }
      }
    });

    const total = await prisma.testSession.count();

    res.json({ 
      success: true, 
      data: sessions,
      meta: { total, page: parseInt(page) }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Detail View: Loads Questions & Answers for ONE session
export const getSessionDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const session = await prisma.testSession.findUnique({
      where: { id },
      include: {
        questions: true,
        answers: true,
        user: { select: { name: true, email: true } }
      }
    });
    if (!session) return res.status(404).json({ success: false, error: "Session not found" });
    res.json({ success: true, data: session });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const deleteSession = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.testSession.delete({ where: { id } });
    res.json({ success: true, message: "Session and related logs deleted" });
  } catch (error) {
    res.status(400).json({ success: false, error: "Delete failed" });
  }
};

/* ==========================================
   6. QUESTION MANAGEMENT
   ========================================== */

export const createQuestion = async (req, res) => {
    try {
        const { sessionId, indexInSession, examType, topic, difficulty, questionText, optionA, optionB, optionC, optionD, correctOption, explanation } = req.body;
        
        const question = await prisma.testQuestion.create({
            data: {
                sessionId, indexInSession, examType, topic, difficulty, 
                questionText, optionA, optionB, optionC, optionD, correctOption, explanation
            }
        });
        res.json({ success: true, data: question });
    } catch(e) { 
        res.status(400).json({ success: false, error: e.message }); 
    }
}

export const updateQuestion = async (req, res) => {
  try {
    const { id } = req.params;
    // `sessionId` and `indexInSession` are deliberately not editable: moving a
    // question between sessions through a field spread would break the
    // @@unique([sessionId, indexInSession]) ordering that the runner and the
    // result page both index by, and silently renumber somebody's paper.
    const data = pick(req.body, QUESTION_EDITABLE_FIELDS);
    if (!Object.keys(data).length) {
      return res.status(400).json({ success: false, error: "No editable fields supplied" });
    }
    const rejected = sanitizeDiagram(data);
    if (rejected) return res.status(400).json({ success: false, error: rejected });
    const question = await prisma.testQuestion.update({ where: { id }, data });
    res.json({ success: true, data: question });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
};

export const deleteQuestion = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.testQuestion.delete({ where: { id } });
    res.json({ success: true, message: "Question deleted" });
  } catch (e) { 
    res.status(400).json({ success: false, error: e.message }); 
  }
};