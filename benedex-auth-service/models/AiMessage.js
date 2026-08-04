import mongoose from "mongoose";

const AiMessageSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: ["user", "model"], // 'model' corresponds to Gemini history
      required: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: [4000, "Message cannot exceed 4,000 characters"],
    },
  },
  { timestamps: true }
);

/* -------------------------------------------------------------------------- */
/*                                   INDEXES                                  */
/* -------------------------------------------------------------------------- */

// ⚡ 1. Primary Query Index: Fast history fetches sorted by date per user
AiMessageSchema.index({ userId: 1, createdAt: -1 });

// 🧹 2. TTL Cleanup: Automatically purge support AI chat logs older than 90 days
AiMessageSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7776000 });

export default mongoose.model("AiMessage", AiMessageSchema);