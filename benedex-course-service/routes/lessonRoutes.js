import express from "express";
import {
  createLesson,
  getModuleLessons,
  completeLesson,
  getLessonProgress,
} from "../controllers/lessonController.js";
import { protect, authorize } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/", protect, authorize("admin", "instructor"), createLesson);
router.get("/module/:moduleId", protect, getModuleLessons);
router.post("/complete/:lessonId", protect, authorize("student"), completeLesson);
router.get("/progress", protect, getLessonProgress);

export default router;