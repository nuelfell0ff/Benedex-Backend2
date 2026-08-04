import mongoose from "mongoose";

const lessonProgressSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    lesson: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Lesson",
      required: true,
    },
    completed: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

lessonProgressSchema.index({ student: 1 });
lessonProgressSchema.index({ student: 1, lesson: 1 }, { unique: true });

const LessonProgress = mongoose.model("LessonProgress", lessonProgressSchema);
export default LessonProgress;