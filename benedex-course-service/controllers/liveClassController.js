import LiveClass from "../models/LiveClass.js";
import { recordLearningActivity } from "../utils/studentLearning.js";
import sendPushNotification from "../utils/sendPushNotification.js";
import Course from "../models/Course.js";

// Create live class
export const createLiveClass = async (req, res) => {
  try {
    const liveClass = await LiveClass.create({
      title: req.body.title,
      description: req.body.description,
      course: req.body.course,
      meetingLink: req.body.meetingLink,
      platform: req.body.platform,
      startTime: req.body.startTime,
      endTime: req.body.endTime,
      instructor: req.user._id
    });

    res.status(201).json(liveClass);

    // BACKGROUND TASK: Broadcast Chrome Push Notifications
    try {
      const courseData = await Course.findById(req.body.course).select("students").lean();

      if (courseData && Array.isArray(courseData.students)) {
        courseData.students.forEach((studentId) => {
          sendPushNotification(studentId, {
            title: "🔴 New Live Class Scheduled!",
            body: `"${req.body.title}" has been scheduled. Check your dashboard timeline.`,
            url: "/student/live-classes"
          }).catch(err => console.error("Push notify error:", err));
        });
      }
    } catch (pushError) {
      console.error("Background broadcast push notification failure:", pushError);
    }

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get classes for a course
export const getCourseLiveClasses = async (req, res) => {
  try {
    const classes = await LiveClass.find({ course: req.params.courseId })
      .populate("instructor", "fullName")
      .sort({ startTime: 1 })
      .lean();

    res.json(classes);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ⚡ OPTIMIZED: Get classes available to the logged-in student
export const getStudentLiveClasses = async (req, res) => {
  try {
    // 1. First fetch ONLY the course IDs where the student is enrolled
    const enrolledCourses = await Course.find(
      { students: req.user._id },
      { _id: 1 }
    ).lean();

    if (!enrolledCourses.length) {
      return res.json([]);
    }

    const courseIds = enrolledCourses.map((c) => c._id);

    // 2. Fetch live classes matching only those course IDs directly from MongoDB
    const visibleClasses = await LiveClass.find({ course: { $in: courseIds } })
      .populate("instructor", "fullName")
      .populate("course", "title")
      .sort({ startTime: 1 })
      .lean();

    res.json(visibleClasses);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Join a live class
export const joinLiveClass = async (req, res) => {
  try {
    const liveClass = await LiveClass.findById(req.params.classId)
      .populate("course", "students");

    if (!liveClass) {
      return res.status(404).json({ message: "Live class not found" });
    }

    const enrolled = Array.isArray(liveClass.course?.students)
      ? liveClass.course.students.some((id) => id.toString() === req.user._id.toString())
      : false;

    if (!enrolled) {
      return res.status(403).json({
        message: "You need to enroll in this course before joining the live class"
      });
    }

    const alreadyJoined = Array.isArray(liveClass.attendees)
      ? liveClass.attendees.some((id) => id.toString() === req.user._id.toString())
      : false;

    if (!alreadyJoined) {
      liveClass.attendees.push(req.user._id);
      await liveClass.save();

      await recordLearningActivity({
        student: req.user._id,
        type: "live_class_joined",
        title: `Joined live class: ${liveClass.title}`,
        points: 0
      });
    }

    res.json({
      message: "Live class joined",
      meetingLink: liveClass.meetingLink,
      liveClassId: liveClass._id
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};