import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

import connectDB from "./config/db.js";
import { globalLimiter } from "./middleware/rateLimiter.js";
import errorHandler from "./middleware/errorMiddleware.js";
import notFound from "./middleware/notFoundMiddleware.js";

// Academic Domain Routes
import courseRoutes from "./routes/courseRoutes.js";
import moduleRoutes from "./routes/moduleRoutes.js";
import lessonRoutes from "./routes/lessonRoutes.js";
import assignmentRoutes from "./routes/assignmentRoutes.js";
import quizRoutes from "./routes/quizRoutes.js";
import instructorRoutes from "./routes/instructorRoutes.js";
import rewardRoutes from "./routes/rewardRoutes.js";
import liveClassRoutes from "./routes/liveClassRoutes.js";
import certificateRoutes from "./routes/certificateRoutes.js";

connectDB();

const app = express();

app.set("trust proxy", 1);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(cors({ origin: process.env.CLIENT_URL || "*", credentials: true }));

app.use("/api", globalLimiter);

// Academic Routes
app.use("/api/courses", courseRoutes);
app.use("/api/modules", moduleRoutes);
app.use("/api/lessons", lessonRoutes);
app.use("/api/instructor", instructorRoutes);
app.use("/api/assignments", assignmentRoutes);
app.use("/api/quizzes", quizRoutes);
app.use("/api/rewards", rewardRoutes);
app.use("/api/live-classes", liveClassRoutes);
app.use("/api/certificates", certificateRoutes);

app.get("/health", (req, res) => {
  res.json({ message: "Benedex Course Service running 🚀" });
});

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.COURSE_PORT || process.env.PORT || 5002;
app.listen(PORT, () => {
  console.log(`🚀 Benedex Course Service running on port ${PORT}`);
});