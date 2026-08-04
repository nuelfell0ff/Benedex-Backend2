import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true, // Speeds up basic user lookups
    },

    title: {
      type: String,
      required: true,
      trim: true,
    },

    message: {
      type: String,
      required: true,
      trim: true,
    },

    type: {
      type: String,
      enum: ["assignment", "live-class", "announcement", "system"],
      default: "system",
      index: true,
    },

    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true, // Automatically provides createdAt and updatedAt
  }
);

/* -------------------------------------------------------------------------- */
/*                                   INDEXES                                  */
/* -------------------------------------------------------------------------- */

// ⚡ 1. Primary Query Index: Fetch user notifications ordered by newest first
notificationSchema.index({ user: 1, createdAt: -1 });

// ⚡ 2. Unread Badge Counter Index: Quick lookups for user's unread notifications
notificationSchema.index({ user: 1, isRead: 1 });

// 🧹 3. TTL Index: Automatically deletes notifications after 60 days (60 days * 24h * 3600s)
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 5184000 });

const Notification = mongoose.model("Notification", notificationSchema);

export default Notification;