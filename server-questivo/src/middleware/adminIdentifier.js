import jwt from "jsonwebtoken";
// import { AppError } from "../utills/errorHandler.js";
import prisma from "../prismaClient.js";

export const adminIdentifier = async (req, res, next) => {
  try {
    let token;

    // 1️⃣ Get token from header or cookie
    if (req.headers.authorization?.startsWith("Bearer ")) {
      token = req.headers.authorization.split(" ")[1];
    } else if (req.cookies?.Authorization) {
      const cookieToken = req.cookies.Authorization;
      token = cookieToken.startsWith("Bearer ")
        ? cookieToken.split(" ")[1]
        : cookieToken;
    }

    // 2️⃣ No token → reject
    if (!token) {
      return res
        .status(403)
        .json({ success: false, message: "Unauthorized — Token missing" });
    }

    // 3️⃣ Verify JWT signature
    
    const decoded = jwt.verify(token, process.env.Secret_Token);
    if (!decoded || !decoded.userId) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid token" });
    }

    

    // 4️⃣ Fetch user from DB
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, email: true, name: true, role: true },
    });

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // 5️⃣ Verify real DB role
    if (user.role !== "admin" && user.role !== "superadmin") {
      return res.status(403).json({
        success: false,
        message: "Access denied — Admins only",
      });
    }

    // 6️⃣ Attach to request
    req.user = user;
    next();
  } catch (error) {
    console.error("Admin Identifier Error:", error.message);
    return res
      .status(401)
      .json({ success: false, message: "Token verification failed" });
  }
};
