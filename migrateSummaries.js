// migrateSummaries.js
import dotenv from "dotenv";
dotenv.config(); // loads .env into process.env

import mongoose from "mongoose";
import Summary from "../gratitude-backend/models/Summary.js";
import Entry from "../gratitude-backend/models/Entry.js";

async function migrate() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    throw new Error("MONGO_URI not set. Add it to .env or export it in your shell.");
  }

  await mongoose.connect(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  console.log("Connected to MongoDB. Starting migration...");

  const allSummaries = await Summary.find({});
  for (const s of allSummaries) {
    const month = s.month;
    const start = new Date(`${month}-01T00:00:00.000Z`);
    const next = new Date(start);
    next.setUTCMonth(next.getUTCMonth() + 1);
    const end = new Date(next.getTime() - 1);

    const count = await Entry.countDocuments({
      deviceId: s.deviceId,
      date: { $gte: start, $lte: end },
    });

    s.entriesCountAtLastGenerate = count;
    s.generatedAt = s.generatedAt || s.createdAt || new Date();
    await s.save();

    console.log(`Patched ${s.deviceId} ${month} -> entriesCountAtLastGenerate=${count}`);
  }

  console.log("Migration complete.");
  await mongoose.disconnect();
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
