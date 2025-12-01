// models/Summary.js
import mongoose from "mongoose";

const summarySchema = new mongoose.Schema({
  deviceId: { type: String, required: true },
  month: { type: String, required: true }, // Format: "2025-11"
  summaryText: { type: String, required: true },
  entriesCountAtLastGenerate: { type: Number, default: 0 }, // <-- new
  generatedAt: { type: Date, default: Date.now },           // <-- new
  createdAt: { type: Date, default: Date.now }
});

// Compound index to ensure one summary per device per month
summarySchema.index({ deviceId: 1, month: 1 }, { unique: true });

export default mongoose.model("Summary", summarySchema);
