import Progress from "../models/Progress.js";
import { applyXpToUser, recordLearningActivity } from "../utils/studentLearning.js";

/**
 * @desc    Add XP to a student (Self-reward or Admin/Instructor award)
 * @route   POST /api/rewards/xp
 * @access  Private
 */
export const addXP = async (req, res) => {
  try {
    const { studentId, xp } = req.body;
    const amountOfXp = Number(xp) || 0;

    if (amountOfXp <= 0) {
      return res.status(400).json({ message: "XP amount must be a positive number" });
    }

    // Determine target user (either passed studentId or authenticated user)
    const targetUserId = studentId || req.user?._id || req.user?.id;

    if (!targetUserId) {
      return res.status(400).json({ message: "Target student ID is required" });
    }

    // Pass user context or ID to studentLearning helper
    const userContext = req.user && (req.user._id === targetUserId || req.user.id === targetUserId)
      ? req.user
      : { _id: targetUserId, id: targetUserId };

    const updatedUser = await applyXpToUser(userContext, amountOfXp);

    await recordLearningActivity({
      student: targetUserId,
      type: "xp_awarded",
      title: `XP awarded: +${amountOfXp}`,
      points: amountOfXp
    });

    return res.status(200).json({
      success: true,
      message: "XP updated successfully",
      xp: updatedUser?.xp || (req.user?.xp ? req.user.xp + amountOfXp : amountOfXp),
      badges: updatedUser?.badges || req.user?.badges || []
    });

  } catch (error) {
    console.error("Add XP error:", error.message);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to update XP"
    });
  }
};

/**
 * @desc    Get reward stats for authenticated student
 * @route   GET /api/rewards/my-rewards
 * @access  Private
 */
export const getMyRewards = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: "User context not found" });
    }

    return res.status(200).json({
      success: true,
      xp: req.user?.xp || 0,
      level: req.user?.level || 1,
      badges: req.user?.badges || []
    });

  } catch (error) {
    console.error("Get rewards error:", error.message);
    return res.status(500).json({ message: error.message });
  }
};