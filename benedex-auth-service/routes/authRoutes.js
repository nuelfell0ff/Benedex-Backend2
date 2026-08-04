import express from "express";
import {
    registerUser,
    loginUser,
    googleAuthCallbackSuccess,
    forgotPassword,
    resetPassword,
    updatePassword,
    logoutUser
} from "../controllers/authController.js";
import { protect } from "../middleware/authMiddleware.js";
import { authLimiter } from "../middleware/rateLimiter.js";

const router = express.Router();

// Public auth endpoints
router.post("/register", authLimiter, registerUser);
router.post("/login", authLimiter, loginUser);
router.post("/google", authLimiter, googleAuthCallbackSuccess);

// Password recovery endpoints
router.post("/forgot-password", authLimiter, forgotPassword);
router.put("/reset-password/:token", authLimiter, resetPassword);

// Protected endpoints
router.post("/logout", protect, logoutUser);
router.put("/update-password", protect, updatePassword);

export default router;