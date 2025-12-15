import jwt from "jsonwebtoken";
import { AppError } from "../utills/errorHandler.js";

export const protect = (req, res, next) => {
  const token = req.cookies?.token;
  console.log(token)
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
