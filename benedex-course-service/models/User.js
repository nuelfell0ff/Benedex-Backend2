import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: [true, "Full name is required"],
      trim: true,
      maxlength: [100, "Full name cannot exceed 100 characters"]
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      index: true
    },
    password: {
      type: String,
      select: false,
      required: function () {
        return !this.googleId;
      }
    },
    googleId: {
      type: String,
      unique: true,
      sparse: true
    },
    role: {
      type: String,
      enum: ["student", "admin", "instructor"],
      default: "student"
    },
    status: {
      type: String,
      enum: ["active", "suspended"],
      default: "active"
    },
    profileImage: {
      type: String,
      default: ""
    },
    xp: {
      type: Number,
      default: 0
    },
    badges: [
      {
        type: String
      }
    ],
    resetPasswordToken: {
      type: String,
      select: false
    },
    resetPasswordExpires: {
      type: Date,
      select: false
    }
  },
  {
    timestamps: true
  }
);

// Prevent overwrite errors when imported multiple times across service modules
const User = mongoose.models.User || mongoose.model("User", userSchema);

export default User;