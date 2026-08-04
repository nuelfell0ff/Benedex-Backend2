import express from "express";
import {
  createModule,
  getCourseModules,
  getAllModules,
  getSingleModule,
} from "../controllers/moduleController.js";
import { protect, authorize } from "../middleware/authMiddleware.js";
import { cacheRoute, clearCachePattern } from "../middleware/cacheMiddleware.js";

const router = express.Router();

router.get("/", protect, cacheRoute(300), getAllModules);
router.post(
  "/",
  protect,
  authorize("admin", "instructor"),
  (req, res, next) => {
    clearCachePattern("/api/modules");
    clearCachePattern("/api/courses/enrolled-full");
    next();
  },
  createModule
);
router.get("/single/:id", protect, cacheRoute(300), getSingleModule);
router.get("/:courseId", protect, cacheRoute(300), getCourseModules);

export default router;