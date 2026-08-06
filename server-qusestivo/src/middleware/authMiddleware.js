import jwt from "jsonwebtoken";
import { AppError } from "../utills/errorHandler.js";
import { readSessionToken } from "../lib/sessionToken.js";

export const protect = (req, res, next) => {
  // Cookie, then Authorization header — see readSessionToken for why there are
  // two carriers and why the cookie is tried first.
  const token = readSessionToken(req);
  // The session JWT is a bearer credential: anyone who reads it is that user
  // until it expires. Printing it put a working credential for every logged-in
  // request into the hosting provider's log stream, where it is retained,
  // searchable, and readable by anyone with dashboard access.
  if (!token) {
    throw new AppError("Not authorized, token missing", 401);
  }

  try {
    const decoded = jwt.verify(token, process.env.Secret_Token);

    // 🔥 IMPORTANT
    req.userId = decoded.userId;

    next();
  } catch (err) {
    throw new AppError("Not authorized, token invalid", 401);
  }
};
