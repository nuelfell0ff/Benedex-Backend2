import dotenv from "dotenv";
dotenv.config(); // Loads .env from local directory

import express from "express";
import cors from "cors";
import http from "http";
import { Server } from "socket.io";
import cookieParser from "cookie-parser";

import connectDB from "./config/db.js";
import errorHandler from "./middleware/errorMiddleware.js";
import notFound from "./middleware/notFoundMiddleware.js";

// Auth & User Domain Routes
import authRoutes from "./routes/authRoutes.js";
import studentRoutes from "./routes/studentRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import userManagementRoutes from "./routes/userManagementRoutes.js";
import settingsRoutes from "./routes/settingsRoutes.js";
import dashboardRoutes from "./routes/dashboardRoutes.js";

// Community & Real-time Domain Routes
import communityRoutes from "./routes/communityRoutes.js";
import messageRoutes from "./routes/messageRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import notifications from "./routes/notifications.js";
import searchRoutes from "./routes/searchRoutes.js";
import aiRoutes from "./routes/aiRoutes.js";

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || "*",
    methods: ["GET", "POST"],
  },
});

app.set("trust proxy", 1);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(cors({ origin: process.env.CLIENT_URL || "*", credentials: true }));

// Health Check
app.get("/health", (req, res) => {
  res.json({ message: "Benedex Auth Service running 🚀" });
});

// Domain Routes
app.use("/api/auth", authRoutes);
app.use("/api/student", studentRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/users", userManagementRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/community", communityRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/notifications-list", notifications);
app.use("/api/search", searchRoutes);
app.use("/api/ai", aiRoutes);

// Real-time Messaging Sockets
io.on("connection", (socket) => {
  console.log(`⚡ [Socket.io] User connected: ${socket.id}`);

  socket.on("join-room", (room) => {
    socket.join(room);
  });

  socket.on("send-message", (data) => {
    io.to(data.room).emit("receive-message", data);
  });

  socket.on("disconnect", () => {
    console.log("⚡ [Socket.io] User disconnected");
  });
});

// Fallback handlers
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.AUTH_PORT || process.env.PORT || 5001;

// Connect to MongoDB FIRST, then bind the HTTP/Socket server
const startServer = async () => {
  try {
    await connectDB();
    server.listen(PORT, () => {
      console.log(`🚀 Benedex Auth Service running on port ${PORT}`);
    });
  } catch (error) {
    console.error(`Failed to boot Auth Service: ${error.message}`);
    process.exit(1);
  }
};

startServer();