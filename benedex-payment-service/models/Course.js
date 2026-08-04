import mongoose from "mongoose";

const courseSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    description: { type: String, required: true },
    instructor: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    duration: { type: String, default: "3 Months" },
    price: { type: Number, required: true },
    tools: [{ type: String }],
    image: { type: String },
    students: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes for fast lookups
courseSchema.index({ students: 1 });
courseSchema.index({ instructor: 1 });

// Virtual relationship to Module model
courseSchema.virtual("modules", {
  ref: "Module",
  localField: "_id",
  foreignField: "course",
});

const Course = mongoose.model("Course", courseSchema);
export default Course;