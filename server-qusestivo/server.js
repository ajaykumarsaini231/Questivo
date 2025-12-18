// src/server.js
import express from "express";
import dotenv from "dotenv";
import testRoutes from "./src/routes/testRoutes.js";
import categoryRoutes from "./src/routes/categoryRoutes.js";
import topicRoutes from "./src/routes/topicRoutes.js";
import cors from "cors";
import authrouter from "./src/routes/auth.routes.js"
import cookieParser from "cookie-parser";
import adminRoutes from "./src/routes/adminRoutes.js"
import userroter from './src/routes/userRoutes.js'

dotenv.config();

const app = express();

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Allow frontend access
app.use(cors({
  origin: process.env.FRONTEND_URL ,
  credentials: true
}));

app.get("/", (req, res) => {
  res.send("Mock test API (Prisma + MongoDB) running");
});

app.use("/api", testRoutes);
app.use("/api/category", categoryRoutes);
app.use("/api/cate_topics", topicRoutes);
app.use("/api/auth", authrouter );
app.use("/api/user", userroter );
app.use("/api/admin", adminRoutes);


// import prisma from "./src/prismaClient.js";

// (async () => {
//   try {
//     await prisma.$queryRaw`SELECT 1`;
//     console.log("Prisma can connect to the database.");
//   } catch (e) {
//     console.error("Prisma connection test failed:", e);
//   }
// })();


const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
