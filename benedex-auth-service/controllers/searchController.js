import axios from "axios";
import User from "../models/User.js";

// Helper to strip trailing slashes and redundant api/courses suffix
const normalizeCourseUrl = (url) => {
  if (!url) return "";
  let cleaned = url.replace(/\/+$/, "");
  if (cleaned.endsWith("/api/courses")) {
    cleaned = cleaned.replace(/\/api\/courses$/, "");
  } else if (cleaned.endsWith("/api")) {
    cleaned = cleaned.replace(/\/api$/, "");
  }
  return cleaned;
};

export const globalOmniboxSearch = async (req, res) => {
  try {
    const { q } = req.query;
    const userRole = req.user?.role?.toLowerCase() || "student";
    const authHeader = req.headers.authorization;

    if (!q || q.trim().length < 2) {
      return res.status(200).json([]);
    }

    const searchRegex = new RegExp(q.trim(), "i");

    // 1. Fetch courses over HTTP from Course Service
    const courseTask = (async () => {
      const baseUrl = normalizeCourseUrl(process.env.COURSE_SERVICE_URL);
      if (!baseUrl) return [];

      try {
        const response = await axios.get(`${baseUrl}/api/courses`, {
          params: { search: q.trim() },
          headers: { Authorization: authHeader }
        });

        const resData = response.data;
        const allCourses = Array.isArray(resData)
          ? resData
          : resData?.courses || resData?.data || [];

        // Filter and limit matching courses if the course-service performs broad listing
        return allCourses
          .filter((c) => c?.title && new RegExp(q.trim(), "i").test(c.title))
          .slice(0, 5);
      } catch (err) {
        console.error("⚠️ Omnibox Course Service fetch failed:", err.response?.data || err.message);
        return [];
      }
    })();

    // 2. Query local Auth Service database for students if authorized
    const studentTask = (async () => {
      if (userRole === "instructor" || userRole === "admin") {
        return User.find({ fullName: searchRegex, role: "student" })
          .select("fullName role _id profileImage")
          .limit(5)
          .lean();
      }
      return [];
    })();

    const [courses, students] = await Promise.all([courseTask, studentTask]);

    // 3. Format results for the frontend
    const formattedCourses = (courses || []).map((course) => ({
      title: course.title,
      path: userRole === "admin" ? `/admin/courses` : `/student/courses`,
      type: "Course"
    }));

    const formattedStudents = (students || []).map((student) => ({
      title: student.fullName,
      type: "Student",
      isStudentRedirect: true,
      studentData: {
        _id: student._id,
        fullName: student.fullName,
        profileImage: student.profileImage,
        courseContext: "Searched Profile Link"
      }
    }));

    return res.status(200).json([...formattedCourses, ...formattedStudents]);
  } catch (error) {
    console.error("Backend omnibox route query breakdown:", error);
    return res.status(500).json({ message: "Search compilation failed" });
  }
};