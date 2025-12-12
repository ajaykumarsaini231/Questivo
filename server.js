// src/server.js
import express from "express";
import dotenv from "dotenv";
import testRoutes from "./src/routes/testRoutes.js";
import categoryRoutes from "./src/routes/categoryRoutes.js";
import topicRoutes from "./src/routes/topicRoutes.js";
import cors from "cors";

dotenv.config();

const app = express();

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
