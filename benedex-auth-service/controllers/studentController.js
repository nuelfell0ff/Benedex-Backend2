import axios from "axios";
import User from "../models/User.js";
import Progress from "../models/Progress.js";
import LearningActivity from "../models/LearningActivity.js";
import { buildLearningStats } from "../utils/studentLearning.js";

export const studentDashboard = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id;
    const authHeader = req.headers.authorization;
    const courseServiceUrl = process.env.COURSE_SERVICE_URL || "http://localhost:5002";

    const httpConfig = {
      headers: { Authorization: authHeader || "" },
      timeout: 5000,
    };

    // 1. Parallel local database queries with .lean()
    const [user, progress, allActivities, unreadActivityCount] = await Promise.all([
      User.findById(userId).select("-password").lean(),
      Progress.find({ student: userId }).lean().catch(() => []),
      LearningActivity.find({ student: userId }).sort({ createdAt: -1 }).limit(100).lean().catch(() => []),
      LearningActivity.countDocuments({
        student: userId,
        $or: [{ isViewed: false }, { isViewed: { $exists: false } }],
      }).catch(() => 0),
    ]);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // 2. Compute aggregate XP from activity history as fallback
    const activityXpSum = allActivities.reduce((acc, act) => acc + (Number(act.points) || 0), 0);

    let userXp = Number(user.xp) || 0;
    if (userXp === 0 && activityXpSum > 0) {
      userXp = activityXpSum;
      User.findByIdAndUpdate(userId, { $set: { xp: activityXpSum } }).catch((err) =>
        console.error("XP Auto-sync failed:", err.message)
      );
    }

    // 3. Fetch remote microservice data over HTTP
    let enrolledCourses = [];
    let submissions = [];

    const [coursesRes, submissionsRes] = await Promise.allSettled([
      axios.get(`${courseServiceUrl}/api/courses/enrolled`, httpConfig),
      axios.get(`${courseServiceUrl}/api/submissions/my-submissions`, httpConfig),
    ]);

    if (coursesRes.status === "fulfilled") enrolledCourses = coursesRes.value.data || [];
    if (submissionsRes.status === "fulfilled") submissions = submissionsRes.value.data || [];

    const recentActivities = allActivities.slice(0, 10);
    const learningSummary = buildLearningStats(allActivities);

    const level = Math.max(1, Math.floor(userXp / 100) + 1);
    const xpTarget = 100 * level;
    const xpProgress = Math.min(100, Math.round((userXp / xpTarget) * 100));

    res.json({
      profile: {
        ...user,
        xp: userXp,
      },
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
      unreadActivityCount,
    });
  } catch (error) {
    console.error("Student dashboard error:", error.message);
    res.status(500).json({ message: error.message || "Internal Server Error" });
  }
};

export const clearStudentActivityViews = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id;
    await LearningActivity.updateMany(
      {
        student: userId,
        $or: [{ isViewed: false }, { isViewed: { $exists: false } }],
      },
      {
        $set: { isViewed: true },
      }
    );

    res.json({ message: "Activities marked as viewed" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const adminDashboard = async (req, res) => {
  res.json({ message: "Welcome Admin" });
};