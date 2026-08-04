import Course from "../models/Course.js";
import Progress from "../models/Progress.js";
import User from "../models/User.js";
import { applyXpToUser, recordLearningActivity } from "../utils/studentLearning.js";
import sendPushNotification from "../utils/sendPushNotification.js";
import { logAdminActivity } from "../middleware/auditLogger.js";

export const createCourse = async (req, res) => {
  try {
    const imageUrl = req.file ? req.file.path : req.body.image || null;

    let parsedTools = req.body.tools;
    if (typeof req.body.tools === "string") {
      try {
        parsedTools = JSON.parse(req.body.tools);
      } catch {
        parsedTools = req.body.tools.split(",").map((t) => t.trim());
      }
    }

    const course = await Course.create({
      title: req.body.title,
      slug: req.body.slug,
      description: req.body.description,
      price: req.body.price,
      tools: parsedTools,
      duration: req.body.duration,
      image: imageUrl,
      instructor: req.user._id || req.user.id,
    });

    if (req.user && req.user.role === "admin") {
      await logAdminActivity(
        req,
        "COURSES",
        "CREATE",
        `Created a brand new course entitled: "${course.title}"`
      );
    }

    res.status(201).json(course);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getCourses = async (req, res) => {
  try {
    const courses = await Course.find()
      .populate("instructor", "fullName email")
      .lean();

    if (req.user && req.user.role === "admin") {
      await logAdminActivity(
        req,
        "COURSES",
        "VIEW",
        "Accessed and viewed the courses management data stream."
      );
    }

    res.json(courses);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getSingleCourse = async (req, res) => {
  try {
    const course = await Course.findById(req.params.id).lean();
    if (!course) {
      return res.status(404).json({ message: "Course not found" });
    }
    res.json(course);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const enrollCourse = async (req, res) => {
  try {
    const courseId = req.params.id || req.params.courseId;
    const userId = req.user?._id || req.user?.id || req.body.studentId;

    if (!userId) {
      return res.status(400).json({ message: "Student ID is required for enrollment" });
    }

    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ message: "Course not found" });
    }

    if (!course.students) {
      course.students = [];
    }

    const alreadyEnrolled = course.students.some(
      (studentId) => studentId.toString() === userId.toString()
    );

    if (!alreadyEnrolled) {
      course.students.push(userId);
      await course.save();

      const existingProgress = await Progress.findOne({ student: userId, course: course._id });
      if (!existingProgress) {
        await Progress.create({
          student: userId,
          course: course._id,
          completedModules: [],
        });
      }
    }

    // Always update XP & log activity using explicit userId
    await applyXpToUser(userId, 10);

    await recordLearningActivity({
      student: userId,
      type: alreadyEnrolled ? "course_accessed" : "course_enrolled",
      title: `${alreadyEnrolled ? "Accessed" : "Enrolled in"} ${course.title}`,
      points: 10,
    });

    if (alreadyEnrolled) {
      return res.status(200).json({ message: "Already enrolled", course });
    }

    res.json({ message: "Enrollment successful", course });

    try {
      await sendPushNotification(userId, {
        title: "🚀 Enrollment Confirmed!",
        body: `Welcome to "${course.title}". Your learning path is unlocked!`,
        url: `/student/course/${course._id}`,
      });
    } catch (pushError) {
      console.error("Background push notification failure:", pushError);
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getStudentCourses = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const enrolledCourses = await Course.find({ students: userId })
      .populate("instructor", "fullName profileImage role")
      .select("title instructor image")
      .lean();

    res.status(200).json(enrolledCourses);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getEnrolledCoursesFull = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id;

    const enrolledCourses = await Course.find({ students: userId })
      .populate("instructor", "fullName profileImage role")
      .populate({
        path: "modules",
        select: "title order description month",
        options: { sort: { month: 1, order: 1 } },
        populate: {
          path: "lessons",
          select: "title duration type order contentUrl videoUrl isPreview",
          options: { sort: { order: 1 } },
        },
      })
      .lean();

    res.status(200).json(enrolledCourses);
  } catch (error) {
    console.error("Error fetching full enrolled course tree:", error);
    res.status(500).json({ message: error.message });
  }
};

export const getInstructorCourses = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const courses = await Course.find({ instructor: userId })
      .populate({
        path: "students",
        select: "fullName profileImage role email",
      })
      .select("title students")
      .lean();

    res.status(200).json(courses);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getCourseTelemetry = async (req, res) => {
  try {
    const totalCourses = await Course.countDocuments({});

    const enrollmentAggregate = await Course.aggregate([
      {
        $project: {
          studentCount: { $size: { $ifNull: ["$students", []] } },
        },
      },
      {
        $group: {
          _id: null,
          totalEnrollments: { $sum: "$studentCount" },
        },
      },
    ]);

    const totalEnrollments = enrollmentAggregate.length > 0 ? enrollmentAggregate[0].totalEnrollments : 0;

    return res.status(200).json({
      success: true,
      totalCourses,
      totalEnrollments,
      pendingSubmissions: 0,
    });
  } catch (error) {
    console.error("Telemetry computation error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Failed to gather course telemetry.",
    });
  }
};