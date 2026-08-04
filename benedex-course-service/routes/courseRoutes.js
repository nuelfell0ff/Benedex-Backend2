import express from "express";
import {
  createCourse,
  getCourses,
  getSingleCourse,
  enrollCourse,
  getStudentCourses,
  getEnrolledCoursesFull,
  getInstructorCourses,
  getCourseTelemetry,
} from "../controllers/courseController.js";
import { protect, authorize } from "../middleware/authMiddleware.js";
import { upload } from "../config/cloudinary.js";
import { cacheRoute, clearCachePattern } from "../middleware/cacheMiddleware.js";

const router = express.Router();

// 1. Inter-Service Communication Endpoint
router.get("/internal/telemetry", protect, getCourseTelemetry);

// 2. Catalog & Aggregation
router.get("/", cacheRoute(600), getCourses);

// Student Specific (Uncached to prevent cache pollution across users)
router.get("/enrolled", protect, getStudentCourses);
router.get("/enrolled-full", protect, getEnrolledCoursesFull);
router.get("/student/registered", protect, authorize("student"), getStudentCourses);

// 3. Instructor Specific
router.get("/instructor/my-courses", protect, authorize("instructor"), getInstructorCourses);

// 4. Actions & Mutations
router.post(
  "/",
  protect,
  authorize("admin", "instructor"),
  upload.single("image"),
  (req, res, next) => {
    clearCachePattern("/api/courses");
    next();
  },
  createCourse
);

// Handles both Payment Service (/api/courses/:id/enroll) and standard routes (/api/courses/enroll/:courseId)
router.post(
  ["/:id/enroll", "/enroll/:courseId"],
  protect,
  (req, res, next) => {
    clearCachePattern("/api/courses");
    next();
  },
  enrollCourse
);

// 5. Dynamic Parameter Route
router.get("/:id", cacheRoute(600), getSingleCourse);

export default router;