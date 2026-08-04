import axios from "axios";
import http from "http";
import https from "https";
import User from "../models/User.js";
import Progress from "../models/Progress.js";
import LearningActivity from "../models/LearningActivity.js";
import { buildLearningStats } from "../utils/studentLearning.js";

// Persistent HTTP client with Keep-Alive to reuse sockets across calls
const httpAgent = new http.Agent({ keepAlive: true });
const httpsAgent = new https.Agent({ keepAlive: true });

const serviceClient = axios.create({
  httpAgent,
  httpsAgent,
  timeout: 800,
});

// @desc    Get student dashboard metrics & activity summary
// @route   GET /api/dashboard/student
// @access  Private (Student)
export const getStudentDashboard = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;

    // 1. Fetch authenticated user profile using .lean()
    const user = await User.findById(userId).select("-password").lean();
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // 2. Fast parallel MongoDB reads with selected fields
    const [progress, activityHistory] = await Promise.all([
      Progress.find({ student: userId })
        .select("student lesson course completed createdAt")
        .lean()
        .catch(() => []),
      LearningActivity.find({ student: userId })
        .select("type title points createdAt")
        .sort({ createdAt: -1 })
        .limit(50)
        .lean()
        .catch(() => []),
    ]);

    // 3. Inter-service call with keep-alive agent & strict timeout fallback
    let enrolledCourses = [];
    let submissions = [];

    const authHeader = req.headers.authorization;
    const courseServiceUrl = process.env.COURSE_SERVICE_URL || "http://localhost:5002";

    if (authHeader) {
      const httpConfig = {
        headers: { Authorization: authHeader },
      };

      const [coursesRes, submissionsRes] = await Promise.allSettled([
        serviceClient.get(`${courseServiceUrl}/api/courses/enrolled-full`, httpConfig),
        serviceClient.get(`${courseServiceUrl}/api/submissions/my-submissions`, httpConfig),
      ]);

      if (coursesRes.status === "fulfilled") {
        enrolledCourses = coursesRes.value.data || [];
      }
      if (submissionsRes.status === "fulfilled") {
        submissions = submissionsRes.value.data || [];
      }
    }

    // 4. Activity transformation & gamification metrics
    const recentActivities = activityHistory.slice(0, 20).map((item) => ({
      _id: item._id,
      type: item.type,
      title: item.title,
      points: item.points || 0,
      createdAt: item.createdAt,
    }));

    const fallbackActivityHistory = [
      ...progress.map((item) => ({
        createdAt: item.createdAt,
        points: 0,
      })),
      ...submissions.map((item) => ({
        createdAt: item.createdAt,
        points: item.grade || 0,
      })),
    ];

    const learningSummary = buildLearningStats([
      ...activityHistory,
      ...fallbackActivityHistory,
    ]);

    const userXp = user.xp || 0;
    const level = Math.max(1, Math.floor(userXp / 100));
    const xpTarget = 80 + level * 160;
    const xpProgress = Math.min(100, Math.round((userXp / xpTarget) * 100));

    // 5. Send payload
    return res.status(200).json({
      profile: user,
      xp: userXp,
      level,
      xpTarget,
      xpProgress,
      badges: user.badges || [],
      enrolledCourses,
      progress,
      submissions,
      learningSummary,
      recentActivities,
    });
  } catch (error) {
    console.error("Dashboard Error:", error);
    return res.status(500).json({ message: error.message || "Internal Server Error" });
  }
};

// @desc    Get instructor dashboard metric cards overview
// @route   GET /api/dashboard/analytics/overview
// @access  Private (Instructor only)
export const getInstructorOverview = async (req, res) => {
  try {
    return res.status(200).json({
      totalStudents: 1240,
      completionRate: 78,
      pendingGrading: 14,
      activeCourses: 3,
    });
  } catch (error) {
    return res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// @desc    Get instructor courses and active grading work items
// @route   GET /api/dashboard/courses
// @access  Private (Instructor only)
export const getInstructorCourses = async (req, res) => {
  try {
    return res.status(200).json([
      {
        id: "cpe-308",
        title: "CPE308: Assembly Language Programming & Computer Architecture",
        studentsCount: 420,
        modulesCount: 8,
        completionRate: 82,
        pendingTasks: [
          {
            submissionId: "sub-101",
            taskName: "Assembly Lab 3: Cache Mapping",
            courseCode: "CPE308",
            submittedAt: "8h ago",
          },
        ],
      },
      {
        id: "fe-react",
        title: "Advanced Frontend Engineering with React & Framer Motion",
        studentsCount: 680,
        modulesCount: 12,
        completionRate: 74,
        pendingTasks: [
          {
            submissionId: "sub-102",
            taskName: "Framer Motion Micro-Interactions",
            courseCode: "FE-React",
            submittedAt: "14h ago",
          },
        ],
      },
    ]);
  } catch (error) {
    return res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// @desc    Get weekly telemetry engagement data
// @route   GET /api/dashboard/analytics/weekly-engagement
// @access  Private (Instructor only)
export const getInstructorEngagement = async (req, res) => {
  try {
    return res.status(200).json([45, 62, 58, 84, 76, 92, 88]);
  } catch (error) {
    return res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// @desc    Get drop-off metrics warnings for students at risk
// @route   GET /api/dashboard/analytics/students-at-risk
// @access  Private (Instructor only)
export const getInstructorAtRisk = async (req, res) => {
  try {
    return res.status(200).json([
      {
        studentName: "Emmanuel N.",
        lastActiveWindow: "3 days ago",
        performanceDropPercentage: 24,
      },
      {
        studentName: "Marcus V.",
        lastActiveWindow: "5 days ago",
        performanceDropPercentage: 18,
      },
    ]);
  } catch (error) {
    return res.status(500).json({ message: "Server Error", error: error.message });
  }
};