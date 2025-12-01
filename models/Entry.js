import mongoose from "mongoose";

const entrySchema = new mongoose.Schema({
  deviceId: { type: String, required: true },
  text: { type: String, required: true },
  imageUrl: { type: String },
  imagePublicId: { type: String },
  date: { type: String, required: true },
},{ timestamps: true });

export default mongoose.model("Entry", entrySchema);
