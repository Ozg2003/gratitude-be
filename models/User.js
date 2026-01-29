import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    password: {     
      type: String,
      required: true,
    },

    fcmToken: {
      type: String,
      default: null,
    },

    streak: {
      type: Number,
      default: 0,
    },

    lastEntryDate: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

export default mongoose.models.User || mongoose.model("User", userSchema);
