import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config(); 
import cors from "cors";

import userRoutes from "./routes/user.js";
import entryRoutes from "./routes/entries.js";
import summaryRoutes from "./routes/summary.js";
import tasksRouter from "./routes/tasks.js"; // uptime helper route


// NEW IMPORTS for FCM + scheduler
import "./utils/firebaseAdmin.js";       // initialize firebase admin
import { startDailyJob } from "./utils/dailyNotificationJob.js";



const app = express();

app.get("/health", (req, res) => res.status(200).send("ok"));

app.use("/tasks", tasksRouter);

// Middleware
app.use(cors());
app.use(express.json());
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
}); 

// Routes
app.use("/api/users", userRoutes);
app.use("/api/entries", entryRoutes);
app.use("/api/summary", summaryRoutes);

// MongoDB connect
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("✅ MongoDB connected");

    // Start daily notification job AFTER DB is connected
    startDailyJob();
    console.log("⏰ Daily notification scheduler started");
  })
  .catch((err) => console.error("❌ MongoDB connection error:", err));

const PORT = process.env.PORT || 5001;
app.listen(PORT,"0.0.0.0", () => console.log(`🚀 Server running on port ${PORT}`));
