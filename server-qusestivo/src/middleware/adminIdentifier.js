// middleware/adminMiddleware.js
import jwt from "jsonwebtoken";
import prisma from "../prismaClient.js";
import { readSessionToken } from "../lib/sessionToken.js";

export const adminIdentifier = async (req, res, next) => {
  try {
    // 1️⃣ Cookie, then Authorization header — the same order, and the same
    // reading, that every other authenticated route uses. This was the one
    // place that already read both; sessionToken.js is now that logic, shared.
    const token = readSessionToken(req);

    // 3️⃣ No token found
    if (!token) {
      return res
        .status(401)
        .json({ success: false, message: "Unauthorized — No Token Found" });
    }

    // 4️⃣ Verify Token
    const decoded = jwt.verify(token, process.env.Secret_Token);
    
    if (!decoded || !decoded.userId) {
      return res.status(401).json({ success: false, message: "Invalid Token" });
    }

    // 5️⃣ Check User & Role
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, role: true },
    });

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (user.role !== "admin" && user.role !== "superadmin") {
      return res.status(403).json({ success: false, message: "Access denied — Admins only" });
    }

    req.user = user;
    next();

  } catch (error) {
    console.error("Admin Auth Error:", error.message);
    return res.status(401).json({ success: false, message: "Verification failed" });
  }
};