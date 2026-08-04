import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
      index: true
    },
    amount: {
      type: Number,
      required: true,
      min: [0, "Amount cannot be negative"]
    },
    reference: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    paymentType: {
      type: String,
      enum: ["course_enrollment", "certificate_purchase"],
      default: "course_enrollment"
    },
    status: {
      type: String,
      enum: ["pending", "success", "failed"],
      default: "pending",
      index: true
    }
  },
  {
    timestamps: true
  }
);

const Payment = mongoose.model("Payment", paymentSchema);
export default Payment;