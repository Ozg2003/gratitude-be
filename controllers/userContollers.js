import User from "../models/User.js";
import Entry from "../models/Entry.js";
import Summary from "../models/Summary.js";
import cloudinary from "../utils/cloudinary.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import admin from "../utils/firebaseAdmin.js";

const JWT_SECRET = process.env.JWT_SECRET || "supersecret";

/* ---------------------------------------
   REGISTER USER
------------------------------------------*/
const usernameRegex = /^[A-Za-z][A-Za-z0-9]{2,14}$/;

export const registerUser = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: "Username & password required" });
    }

    if (!usernameRegex.test(username)) {
      return res.status(400).json({
        error:
          "Username must start with a letter and be 3–15 characters long",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        error: "Password must be at least 6 characters",
      });
    }

    const existing = await User.findOne({ username });
    if (existing)
      return res.status(409).json({ error: "Username already taken" });

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      username,
      password: hashedPassword,
    });

    const token = jwt.sign(
      { userId: user._id, username: user.username },
      JWT_SECRET,
      { expiresIn: "30d" }
    );

    res.json({
      token,
      user: {
        id: user._id,
        username: user.username,
        streak: user.streak,
      },
    });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ error: "Registration failed" });
  }
};


/* ---------------------------------------
   LOGIN USER
------------------------------------------*/
export const loginUser = async (req, res) => {
  try {
    const { username, password } = req.body;

    const user = await User.findOne({ username });
    if (!user)
      return res.status(401).json({ error: "Invalid credentials" });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid)
      return res.status(401).json({ error: "Invalid credentials" });

    const token = jwt.sign(
      { userId: user._id, username: user.username },
      JWT_SECRET,
      { expiresIn: "30d" }
    );

    res.json({
      token,
      user: {
        id: user._id,
        username: user.username,
        streak: user.streak,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Login failed" });
  }
};

/* ---------------------------------------
   UPDATE STREAK (JWT protected)
------------------------------------------*/
export const updateStreak = async (req, res) => {
  try {
    const { currentDate } = req.body;
    const { userId } = req.user;

    if (!currentDate)
      return res.status(400).json({ error: "currentDate required" });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const today = new Date(currentDate);
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    const last = user.lastEntryDate
      ? new Date(user.lastEntryDate).toDateString()
      : null;

    const todayStr = today.toDateString();
    const yesterdayStr = yesterday.toDateString();

    if (last === todayStr) {
      return res.json({ message: "Already updated", streak: user.streak });
    } else if (last === yesterdayStr) {
      user.streak += 1;
    } else {
      user.streak = 1;
    }

    user.lastEntryDate = currentDate;
    await user.save();

    res.json({ message: "Streak updated", streak: user.streak });
  } catch (err) {
    console.error("Streak error:", err);
    res.status(500).json({ error: "Failed to update streak" });
  }
};

/* ---------------------------------------
   SAVE FCM TOKEN (JWT protected)
------------------------------------------*/
export const saveFcmToken = async (req, res) => {
  try {
    const { fcmToken } = req.body;
    const { userId } = req.user;

    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    if (!fcmToken) {
      return res.status(400).json({ error: "fcmToken required" });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { fcmToken },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    console.log("✅ FCM token saved for:", user.username);

    res.json({ success: true });
  } catch (err) {
    console.error("FCM save error:", err);
    res.status(500).json({ error: "Failed to save FCM token" });
  }
};


/* ---------------------------------------
   SEND NOTIFICATION TO ALL USERS
------------------------------------------*/
export const sendNotificationToAll = async (title, body) => {
  try {
    const users = await User.find({ fcmToken: { $ne: null } });
    if (!users.length) return;

    const tokens = users.map((u) => u.fcmToken);

    await admin.messaging().sendMulticast({
      notification: { title, body },
      tokens,
    });
  } catch (err) {
    console.error("Notification error:", err);
  }
};
/* ---------------------------------------
   DELETE ACCOUNT (JWT protected)
------------------------------------------*/


export const deleteAccount = async (req, res) => {
  try {
    const { userId } = req.user;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    /* ------------------------------------------------
       1️⃣ Fetch entries to clean Cloudinary images
    ------------------------------------------------ */
    const entries = await Entry.find({ user: userId }).select("imagePublicId");

    for (const entry of entries) {
      if (entry.imagePublicId) {
        try {
          await cloudinary.uploader.destroy(entry.imagePublicId);
        } catch (err) {
          // do NOT fail deletion if Cloudinary fails
          console.warn(
            "⚠️ Failed to delete Cloudinary image:",
            entry.imagePublicId
          );
        }
      }
    }

    /* ------------------------------------------------
       2️⃣ Delete DB data
    ------------------------------------------------ */
    await Entry.deleteMany({ user: userId });
    await Summary.deleteMany({ user: userId });
    await User.findByIdAndDelete(userId);

    return res.json({ success: true });
  } catch (err) {
    console.error("❌ Delete account error:", err);
    return res.status(500).json({ error: "Failed to delete account" });
  }
};

