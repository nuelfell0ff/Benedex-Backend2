import Assignment from "../models/Assignment.js";
import Submission from "../models/Submission.js";
import Course from "../models/Course.js";
import Module from "../models/Module.js"; // <-- FIX: Must import Module for deep populates
import User from "../models/User.js";     // <-- FIX: Must import User for student populates
import cloudinary from "../config/cloudinary.js";
import { applyXpToUser, recordLearningActivity } from "../utils/studentLearning.js";

// CREATE ASSIGNMENT
export const createAssignment = async (req, res) => {
  try {
    const { title, description, module: moduleId, dueDate } = req.body;

    if (!title || !moduleId) {
      return res.status(400).json({ message: "Title and Module ID are required" });
    }

    const assignment = await Assignment.create({
      title,
      description,
      module: moduleId,
      dueDate,
    });

    res.status(201).json(assignment);
  } catch (error) {
    console.error("Create assignment error:", error);
    res.status(500).json({ message: error.message });
  }
};

// SUBMIT ASSIGNMENT
export const submitAssignment = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id;
    const assignmentId = req.body.assignment;

    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    if (!assignmentId) {
      return res.status(400).json({ message: "Assignment ID is required" });
    }

    const assignment = await Assignment.findById(assignmentId).populate({
      path: "module",
      populate: {
        path: "course",
      },
    });

    if (!assignment) {
      return res.status(404).json({ message: "Assignment not found" });
    }

    // Safeguard enrollment validation
    const courseStudents = assignment.module?.course?.students || [];
    const enrolled = courseStudents.some(
      (studentId) => studentId.toString() === userId.toString()
    );

    if (!enrolled) {
      return res.status(403).json({ message: "You are not enrolled in this course" });
    }

    const existingSubmission = await Submission.findOne({
      student: userId,
      assignment: assignmentId,
    });

    if (existingSubmission) {
      return res.status(400).json({ message: "You have already submitted this assignment" });
    }

    const fileBase64 = `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`;

    const uploadedFile = await cloudinary.uploader.upload(fileBase64, {
      folder: "benedex-assignments",
      resource_type: "auto",
    });

    const submission = await Submission.create({
      student: userId,
      assignment: assignmentId,
      fileUrl: uploadedFile.secure_url,
    });

    // Grant XP and record activity
    await applyXpToUser(userId, 25);

    await recordLearningActivity({
      student: userId,
      type: "assignment_submitted",
      title: `Submitted ${assignment.title}`,
      points: 25,
    });

    res.status(201).json({
      message: "Assignment submitted successfully",
      submission,
    });
  } catch (error) {
    console.error("Submit assignment error:", error);
    res.status(500).json({ message: error.message });
  }
};

// GET ASSIGNMENTS
export const getAssignments = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id;
    const userRole = req.user?.role;

    // ADMIN: View all assignments
    if (userRole === "admin") {
      const assignments = await Assignment.find().populate({
        path: "module",
        populate: {
          path: "course",
          select: "title instructor",
        },
      }).lean();
      return res.json(assignments);
    }

    // INSTRUCTOR: View assignments for courses they instruct
    if (userRole === "instructor") {
      const instructorCourses = await Course.find({ instructor: userId }).select("_id");
      const courseIds = instructorCourses.map((c) => c._id.toString());

      const assignments = await Assignment.find().populate({
        path: "module",
        populate: {
          path: "course",
          select: "title instructor",
        },
      }).lean();

      const instructorAssignments = assignments.filter((a) =>
        courseIds.includes(a.module?.course?._id?.toString())
      );

      return res.json(instructorAssignments);
    }

    // STUDENT: View assignments for courses they are enrolled in
    const enrolledCourses = await Course.find({ students: userId }).select("_id");
    const enrolledCourseIds = enrolledCourses.map((c) => c._id.toString());

    const assignments = await Assignment.find().populate({
      path: "module",
      populate: {
        path: "course",
        select: "title",
      },
    }).lean();

    const studentAssignments = assignments.filter((a) =>
      enrolledCourseIds.includes(a.module?.course?._id?.toString())
    );

    res.json(studentAssignments);
  } catch (error) {
    console.error("Get assignments error:", error);
    res.status(500).json({ message: error.message });
  }
};

// GET MY SUBMISSIONS
export const getMySubmissions = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id;
    const submissions = await Submission.find({
      student: userId,
    }).populate({
      path: "assignment",
      select: "title dueDate",
    }).lean();

    res.json(submissions);
  } catch (error) {
    console.error("Get my submissions error:", error);
    res.status(500).json({ message: error.message });
  }
};

// GET ALL SUBMISSIONS (ADMIN & INSTRUCTOR)
export const getSubmissions = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id;
    const userRole = req.user?.role;

    let filter = {};

    // Filter submissions if instructor
    if (userRole === "instructor") {
      const instructorCourses = await Course.find({ instructor: userId }).select("_id");
      const courseIds = instructorCourses.map((c) => c._id.toString());
      
      const assignments = await Assignment.find().populate("module").lean();
      const validAssignmentIds = assignments
        .filter((a) => courseIds.includes(a.module?.course?.toString()))
        .map((a) => a._id);

      filter = { assignment: { $in: validAssignmentIds } };
    }

    const submissions = await Submission.find(filter)
      .populate("student", "fullName email profileImage")
      .populate({
        path: "assignment",
        select: "title dueDate",
      })
      .lean();

    res.json(submissions);
  } catch (error) {
    console.error("Get submissions error:", error);
    res.status(500).json({ message: error.message });
  }
};

// GRADE SUBMISSION
export const gradeSubmission = async (req, res) => {
  try {
    const submission = await Submission.findById(req.params.id);

    if (!submission) {
      return res.status(404).json({ message: "Submission not found" });
    }

    submission.grade = Number(req.body.grade);
    submission.feedback = req.body.feedback || "";
    submission.status = "reviewed";

    await submission.save();

    res.json({
      message: "Submission graded successfully",
      submission,
    });
  } catch (error) {
    console.error("Grade submission error:", error);
    res.status(500).json({ message: error.message });
  }
};