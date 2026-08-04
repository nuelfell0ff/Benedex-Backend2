import express from "express";
import { addXP, getMyRewards } from "../controllers/rewardController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// Get authenticated user's XP, level, and badges
router.get("/my-rewards", protect, getMyRewards);

// Add XP (accessible to logged-in users / internal triggers)
router.post("/xp", protect, addXP);

export default router;