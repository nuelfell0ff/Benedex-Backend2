import express from "express";
import rateLimit from "express-rate-limit";
import {
  handleSupportChat,
  getSupportHistory,
} from "../controllers/aiController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// 🛡️ Rate Limiter: Max 15 AI chat requests per 1 minute per IP
const aiChatLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 15, // Limit each IP to 15 requests per windowMs
  message: {
    message: "Too many AI messages sent. Please pause for a minute before trying again.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post("/chat", protect, aiChatLimiter, handleSupportChat);
router.get("/history", protect, getSupportHistory);

export default router;