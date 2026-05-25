import express from "express";
import dotenv from "dotenv";
import http from "http"; // 🛠️ Import HTTP module
import { Server } from "socket.io"; // 🛠️ Import Socket.io
import cors from "cors";
import cookieParser from "cookie-parser";

// Routes
import testRoutes from "./src/routes/testRoutes.js";
import categoryRoutes from "./src/routes/categoryRoutes.js";
import topicRoutes from "./src/routes/topicRoutes.js";
import authrouter from "./src/routes/auth.routes.js";
import adminRoutes from "./src/routes/adminRoutes.js";
import userroter from './src/routes/userRoutes.js';
import mailRoutes from "./src/routes/mailRoutes.js";
import resumeRouter from "./src/routes/resumeRoutes.js";
import interviewRoutes from "./src/routes/interviewRoutes.js";

// Sockets
import { initializeInterviewSocket } from "./src/agentic-mock-test/interviewSocket.js"; // 🛠️ Import your socket logic

dotenv.config();

const app = express();
const server = http.createServer(app); // 🛠️ Wrap express app in HTTP server

// Socket.io initialization
initializeInterviewSocket(server); 

app.use(cors({
  origin: process.env.FRONTEND_URL,
  credentials: true
}));

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use("/api/mail", mailRoutes);
app.use("/api/resume", resumeRouter);
app.use("/api/interview", interviewRoutes);
app.use("/api", testRoutes);
app.use("/api/category", categoryRoutes);
app.use("/api/cate_topics", topicRoutes);
app.use("/api/auth", authrouter);
app.use("/api/user", userroter);
app.use("/api/admin", adminRoutes);

app.get("/", (req, res) => {
  res.send("Mock test API running");
});

const PORT = process.env.PORT || 4000;

// 🛠️ IMPORTANT: Server.listen use karo, app.listen nahi
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});