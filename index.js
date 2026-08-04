import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import http from "http";
import { Server } from "socket.io";
import cookieParser from "cookie-parser";

import connectDB from "./benedex-auth-service/config/db.js";
import { parseJsonBody } from "./benedex-course-service/middleware/jsonBodyMiddleware.js";
import { globalLimiter } from "./benedex-auth-service/middleware/rateLimiter.js";

import authRoutes from "./benedex-auth-service/routes/authRoutes.js";
import studentRoutes from "./benedex-auth-service/routes/studentRoutes.js";
import courseRoutes from "./benedex-course-service/routes/courseRoutes.js";
import moduleRoutes from "./benedex-course-service/routes/moduleRoutes.js";
import assignmentRoutes from "./benedex-course-service/routes/assignmentRoutes.js";
import rewardRoutes from "./benedex-course-service/routes/rewardRoutes.js";
import dashboardRoutes from "./benedex-auth-service/routes/dashboardRoutes.js";
import liveClassRoutes from "./benedex-course-service/routes/liveClassRoutes.js";
import notificationRoutes from "./benedex-auth-service/routes/notificationRoutes.js";
import communityRoutes from "./benedex-auth-service/routes/communityRoutes.js";
import paymentRoutes from "./benedex-payment-service/routes/paymentRoutes.js";
import adminRoutes from "./benedex-auth-service/routes/adminRoutes.js";
import userManagementRoutes from "./benedex-auth-service/routes/userManagementRoutes.js";
import settingsRoutes from "./benedex-auth-service/routes/settingsRoutes.js";
import messageRoutes from "./benedex-auth-service/routes/messageRoutes.js";
import errorHandler from "./benedex-auth-service/middleware/errorMiddleware.js";
import notFound from "./benedex-auth-service/middleware/notFoundMiddleware.js";
import lessonRoutes from "./benedex-course-service/routes/lessonRoutes.js";
import quizRoutes from "./benedex-course-service/routes/quizRoutes.js";
import instructorRoutes from "./benedex-course-service/routes/instructorRoutes.js";
import certificateRoutes from "./benedex-course-service/routes/certificateRoutes.js";
import searchRoutes from "./benedex-auth-service/routes/searchRoutes.js";
import aiRoutes from "./benedex-auth-service/routes/aiRoutes.js";
import notification from "./benedex-auth-service/routes/notifications.js";

connectDB();

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// Middlewares
app.set("trust proxy", 1);
app.use("/api", globalLimiter);

app.use(
  express.text({
    type: ["application/json", "application/*+json"],
  })
);

app.use(parseJsonBody);

app.use(
  cors({
    origin: "*",
  })
);

app.use(cookieParser());

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/student", studentRoutes);
app.use("/api/courses", courseRoutes);
app.use("/api/modules", moduleRoutes);
app.use("/api/assignments", assignmentRoutes);
app.use("/api/rewards", rewardRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/live-classes", liveClassRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/community", communityRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/users", userManagementRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/lessons", lessonRoutes);
app.use("/api/quizzes", quizRoutes);
app.use("/api/certificates", certificateRoutes);
app.use("/api/instructor", instructorRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/notifications", notification);

app.use(notFound);
app.use(errorHandler);

// Home route
app.get("/", (req, res) => {
  res.json({
    message: "Benedex API running 🚀",
  });
});

// Socket.IO
io.on("connection", (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on("join-room", (room) => {
    socket.join(room);
  });

  socket.on("send-message", (data) => {
    io.to(data.room).emit("receive-message", data);
  });

  socket.on("disconnect", () => {
    console.log("User disconnected");
  });
});

// FORCED PORT: Ignores process.env if it resolves to 5000
const PORT = (!process.env.PORT || Number(process.env.PORT) === 5000)
  ? 5002
  : Number(process.env.PORT);

server.listen(PORT, () => {
  console.log(`🚀 Benedex Backend explicitly running on port ${PORT}`);
});