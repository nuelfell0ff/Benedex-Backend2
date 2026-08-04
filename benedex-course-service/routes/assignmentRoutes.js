import express from "express";
import {
  createAssignment,
  submitAssignment,
  getAssignments,
  getMySubmissions,
  getSubmissions,
  gradeSubmission,
} from "../controllers/assignmentController.js";
import { protect, authorize } from "../middleware/authMiddleware.js";
import upload from "../middleware/uploadMiddleware.js";
import { clearCachePattern } from "../middleware/cacheMiddleware.js";

const router = express.Router();

// Disabled cacheRoute(180) to prevent role cross-contamination between Student, Instructor, and Admin
router.get("/", protect, getAssignments);
router.get("/my-submissions", protect, getMySubmissions);
router.get("/submissions", protect, authorize("admin", "instructor"), getSubmissions);

router.post(
  "/",
  protect,
  authorize("admin", "instructor"),
  (req, res, next) => {
    clearCachePattern("/api/assignments");
    next();
  },
  createAssignment
);

router.post(
  "/submit",
  protect,
  upload.single("file"),
  (req, res, next) => {
    clearCachePattern("/api/assignments");
    clearCachePattern("/api/modules");
    next();
  },
  submitAssignment
);

router.put(
  "/grade/:id",
  protect,
  authorize("admin", "instructor"),
  (req, res, next) => {
    clearCachePattern("/api/assignments");
    next();
  },
  gradeSubmission
);

export default router;