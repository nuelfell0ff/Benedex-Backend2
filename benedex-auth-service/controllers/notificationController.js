import Notification from "../models/Notification.js";

// Create notification
export const createNotification = async (req, res) => {
  try {
    const notification = await Notification.create({
      user: req.body.user,
      title: req.body.title,
      message: req.body.message,
      type: req.body.type || "info",
    });

    res.status(201).json(notification);
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

// ⚡ Fast query execution with lean(), projection, and safe user ID fallback
export const getNotifications = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id;

    if (!userId) {
      return res.status(400).json({
        message: "User context not identified",
      });
    }

    const notifications = await Notification.find({ user: userId })
      .select("title message type isRead createdAt")
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    res.json(notifications);
  } catch (error) {
    console.error("Get notifications error:", error.message);
    res.status(500).json({
      message: error.message,
    });
  }
};

// Mark notification as read
export const markAsRead = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id;
    const notification = await Notification.findById(req.params.id);

    if (!notification) {
      return res.status(404).json({
        message: "Notification not found",
      });
    }

    // Security check: ensure user owns the notification
    if (userId && notification.user.toString() !== userId.toString()) {
      return res.status(403).json({
        message: "Unauthorized access to this notification",
      });
    }

    notification.isRead = true;
    await notification.save();

    res.json({
      message: "Notification updated",
      notification,
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};