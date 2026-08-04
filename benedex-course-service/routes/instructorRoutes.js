import express from "express";
import { getInstructorDashboardTelemetry } from "../controllers/instructorController.js";
import { protect, authorize } from "../middleware/authMiddleware.js";
import { cacheRoute } from "../middleware/cacheMiddleware.js";

const router = express.Router();

router.get(
  "/dashboard",
  protect,
  authorize("instructor"),
  cacheRoute(30), // 👈 Caches for 30 seconds per instructor, ultra-fast & non-blocking
  getInstructorDashboardTelemetry
);

export default router;