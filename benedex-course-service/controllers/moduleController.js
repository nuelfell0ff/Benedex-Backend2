import Module from "../models/Module.js";
import Assignment from "../models/Assignment.js";
import Submission from "../models/Submission.js";

export const createModule = async (req, res) => {
  try {
    const moduleData = await Module.create({
      title: req.body.title,
      description: req.body.description,
      course: req.body.course,
      month: req.body.month,
      order: req.body.order,
      content: req.body.content,
    });

    res.status(201).json(moduleData);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getAllModules = async (req, res) => {
  try {
    const modules = await Module.find()
      .populate("course", "title")
      .sort({ month: 1, order: 1 })
      .lean();

    res.json(modules);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getSingleModule = async (req, res) => {
  try {
    const moduleData = await Module.findById(req.params.id)
      .populate("course", "title")
      .lean();

    if (!moduleData) {
      return res.status(404).json({ message: "Module not found" });
    }

    res.json(moduleData);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getCourseModules = async (req, res) => {
  try {
    const courseId = req.params.courseId;
    const userId = req.user._id || req.user.id;

    // 1. Fetch modules for course
    const modules = await Module.find({ course: courseId })
      .sort({ month: 1, order: 1 })
      .lean();

    if (!modules.length) {
      return res.json([]);
    }

    // 2. Fetch assignments for these modules
    const moduleIds = modules.map((m) => m._id);
    const assignments = await Assignment.find({ module: { $in: moduleIds } })
      .select("_id module")
      .lean();

    // 3. Fetch user's submissions
    const assignmentIds = assignments.map((a) => a._id);
    const submissions = await Submission.find({
      student: userId,
      assignment: { $in: assignmentIds },
    })
      .select("assignment")
      .lean();

    const submittedSet = new Set(submissions.map((s) => s.assignment.toString()));

    // Map module IDs for fast lookup
    const moduleMap = new Map(modules.map((m) => [m._id.toString(), m]));

    const monthOneAssignments = assignments.filter((a) => {
      const parentModule = moduleMap.get(a.module.toString());
      return parentModule && parentModule.month === 1;
    });

    const monthTwoAssignments = assignments.filter((a) => {
      const parentModule = moduleMap.get(a.module.toString());
      return parentModule && parentModule.month === 2;
    });

    let unlockedMonth = 1;

    if (
      monthOneAssignments.length > 0 &&
      monthOneAssignments.every((a) => submittedSet.has(a._id.toString()))
    ) {
      unlockedMonth = 2;
    }

    if (
      monthTwoAssignments.length > 0 &&
      monthTwoAssignments.every((a) => submittedSet.has(a._id.toString()))
    ) {
      unlockedMonth = 3;
    }

    const visibleModules = modules.filter(
      (module) => (module.month || 1) <= unlockedMonth
    );

    res.json(visibleModules);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};