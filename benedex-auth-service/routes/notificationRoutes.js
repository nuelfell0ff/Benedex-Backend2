import express from "express";
import {
  createNotification,
  getNotifications,
  markAsRead,
} from "../controllers/notificationController.js";
import { protect, authorize } from "../middleware/authMiddleware.js";

const router = express.Router();

// Middleware to prevent caching on dynamic notification endpoints
const disableCache = (req, res, next) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  next();
};

// Admin / Instructor create notification
router.post(
  "/",
  protect,
  authorize("admin", "instructor"),
  createNotification
);

// User notifications (Cache disabled to force fresh fetch)
router.get(
  "/",
  protect,
  disableCache,
  getNotifications
);

// Mark read
router.put(
  "/:id",
  protect,
  markAsRead
);

export default router;