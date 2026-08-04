import mongoose from "mongoose";

const moduleSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String, default: "" },
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
      index: true,
    },
    month: { type: Number, required: true },
    order: { type: Number, required: true },
    content: [
      {
        title: String,
        videoUrl: String,
        resourceUrl: String,
      },
    ],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

moduleSchema.index({ course: 1, month: 1, order: 1 });

// Virtual relationship to Lesson model
moduleSchema.virtual("lessons", {
  ref: "Lesson",
  localField: "_id",
  foreignField: "module",
});

const Module = mongoose.model("Module", moduleSchema);
export default Module;