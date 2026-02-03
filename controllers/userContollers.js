import User from "../models/User.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { generateOtp } from "../utils/otp.js";
import { sendOtpMail } from "../utils/mailer.js";

const JWT_SECRET = process.env.JWT_SECRET || "supersecret";

const OTP_COOLDOWN = 60 * 1000;

const checkOtpCooldown = (user) => {
  if (!user.otpLastSentAt) return true;
  return Date.now() - user.otpLastSentAt > OTP_COOLDOWN;
};

const usernameRegex = /^[A-Za-z][A-Za-z0-9]{2,14}$/;

// Temporary storage for pending registrations (in-memory)
// In production, consider using Redis or a "pending_users" collection
const pendingRegistrations = new Map();

/* =====================================================
   REGISTER → SEND OTP (Don't create user yet!)
===================================================== */
export const registerUser = async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password)
      return res.status(400).json({ error: "All fields required" });

    if (!usernameRegex.test(username))
      return res.status(400).json({ error: "Invalid username" });

    if (password.length < 6)
      return res.status(400).json({ error: "Password too short" });

    // Check if username or email already exists
    const exists = await User.findOne({
      $or: [{ username }, { email }],
    });

    if (exists)
      return res.status(409).json({ error: "User already exists" });

    // Check cooldown for this email in pending registrations
    const pending = pendingRegistrations.get(email);
    if (pending && Date.now() - pending.otpLastSentAt < OTP_COOLDOWN) {
      return res.status(429).json({
        error: "Please wait before requesting another OTP",
      });
    }

    const otp = generateOtp();
    const hashedPassword = await bcrypt.hash(password, 10);
    const hashedOtp = await bcrypt.hash(otp, 10);

    // Store registration data temporarily (NOT in database yet!)
    pendingRegistrations.set(email, {
      username,
      email,
      password: hashedPassword,
      emailOtp: hashedOtp,
      emailOtpExpire: Date.now() + 5 * 60 * 1000,
      otpLastSentAt: Date.now(),
    });

    // Clean up expired pending registrations
    setTimeout(() => {
      const data = pendingRegistrations.get(email);
      if (data && data.emailOtpExpire < Date.now()) {
        pendingRegistrations.delete(email);
      }
    }, 5 * 60 * 1000);

    await sendOtpMail(email, otp);

    res.json({ message: "OTP sent to email" });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ error: "Registration failed" });
  }
};

/* =====================================================
   VERIFY REGISTER OTP → CREATE USER NOW!
===================================================== */
export const verifyRegisterOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    // Get pending registration data
    const pendingData = pendingRegistrations.get(email);

    if (!pendingData || !pendingData.emailOtp)
      return res.status(400).json({ error: "Invalid OTP or registration expired" });

    if (pendingData.emailOtpExpire < Date.now()) {
      pendingRegistrations.delete(email);
      return res.status(400).json({ error: "OTP expired. Please register again." });
    }

    const valid = await bcrypt.compare(otp, pendingData.emailOtp);
    if (!valid)
      return res.status(400).json({ error: "Invalid OTP" });

    // Check again if username/email was taken while OTP was pending
    const exists = await User.findOne({
      $or: [{ username: pendingData.username }, { email }],
    });

    if (exists) {
      pendingRegistrations.delete(email);
      return res.status(409).json({ error: "User already exists" });
    }

    // NOW create the user in database
    const user = await User.create({
      username: pendingData.username,
      email: pendingData.email,
      password: pendingData.password,
      isVerified: true, // Mark as verified immediately
    });

    // Clear pending registration
    pendingRegistrations.delete(email);

    const token = jwt.sign(
      { userId: user._id, username: user.username, email: user.email },
      JWT_SECRET,
      { expiresIn: "30d" }
    );

    res.json({ token, user });
  } catch (err) {
    console.error("Verify register OTP error:", err);
    res.status(500).json({ error: "Verification failed" });
  }
};

/* =====================================================
   RESEND REGISTRATION OTP
===================================================== */
export const resendRegisterOtp = async (req, res) => {
  try {
    const { email } = req.body;

    const pendingData = pendingRegistrations.get(email);

    if (!pendingData)
      return res.status(404).json({ error: "No pending registration found. Please register again." });

    // Check cooldown
    if (Date.now() - pendingData.otpLastSentAt < OTP_COOLDOWN) {
      return res.status(429).json({
        error: "Please wait before requesting another OTP",
      });
    }

    const otp = generateOtp();
    const hashedOtp = await bcrypt.hash(otp, 10);

    // Update pending data
    pendingData.emailOtp = hashedOtp;
    pendingData.emailOtpExpire = Date.now() + 5 * 60 * 1000;
    pendingData.otpLastSentAt = Date.now();

    pendingRegistrations.set(email, pendingData);

    await sendOtpMail(email, otp);

    res.json({ message: "OTP resent to email" });
  } catch (err) {
    console.error("Resend OTP error:", err);
    res.status(500).json({ error: "Could not resend OTP" });
  }
};

/* =====================================================
   LOGIN WITH USERNAME OR EMAIL
===================================================== */
export const loginUser = async (req, res) => {
  try {
    const { identifier, password } = req.body; // Changed from 'username'

    if (!identifier || !password)
      return res.status(400).json({ error: "All fields required" });

    // Find user by username OR email
    const user = await User.findOne({
      $or: [{ username: identifier }, { email: identifier }]
    });

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

    res.json({ token, user });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Login failed" });
  }
};

/* =====================================================
   LOGIN EMAIL OTP - SEND
===================================================== */
export const loginOtp = async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });

    if (!user || !user.isVerified)
      return res.status(404).json({ error: "User not found" });

    if (!checkOtpCooldown(user))
      return res.status(429).json({
        error: "Please wait before requesting another OTP",
      });

    const otp = generateOtp();

    user.emailOtp = await bcrypt.hash(otp, 10);
    user.emailOtpExpire = Date.now() + 5 * 60 * 1000;
    user.otpLastSentAt = Date.now();

    await user.save();
    await sendOtpMail(email, otp);

    res.json({ message: "OTP sent" });
  } catch (err) {
    console.error("Login OTP error:", err);
    res.status(500).json({ error: "Could not send OTP" });
  }
};

/* =====================================================
   LOGIN EMAIL OTP - VERIFY
===================================================== */
export const verifyLoginOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    const user = await User.findOne({ email });

    if (!user || !user.emailOtp)
      return res.status(400).json({ error: "Invalid OTP" });

    if (user.emailOtpExpire < Date.now())
      return res.status(400).json({ error: "OTP expired" });

    const valid = await bcrypt.compare(otp, user.emailOtp);

    if (!valid)
      return res.status(400).json({ error: "Invalid OTP" });

    user.emailOtp = null;
    user.emailOtpExpire = null;
    await user.save();

    const token = jwt.sign(
      { userId: user._id, username: user.username, email: user.email },
      JWT_SECRET,
      { expiresIn: "30d" }
    );

    res.json({ token, user });
  } catch (err) {
    console.error("Verify login OTP error:", err);
    res.status(500).json({ error: "Verification failed" });
  }
};

/* =====================================================
   RECOVERY - SEND OTP
===================================================== */
export const recoverySendOtp = async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });

    if (!user) 
      return res.json({ message: "If account exists, OTP sent" });

    if (!checkOtpCooldown(user))
      return res.status(429).json({
        error: "Please wait before requesting another OTP",
      });

    const otp = generateOtp();

    user.emailOtp = await bcrypt.hash(otp, 10);
    user.emailOtpExpire = Date.now() + 5 * 60 * 1000;
    user.otpLastSentAt = Date.now();

    await user.save();
    await sendOtpMail(email, otp);

    res.json({ message: "OTP sent" });
  } catch (err) {
    console.error("Recovery send OTP error:", err);
    res.status(500).json({ error: "Could not send OTP" });
  }
};

/* =====================================================
   RECOVERY - VERIFY OTP
===================================================== */
export const recoveryVerifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    const user = await User.findOne({ email });

    if (!user || !user.emailOtp)
      return res.status(400).json({ error: "Invalid OTP" });

    if (user.emailOtpExpire < Date.now())
      return res.status(400).json({ error: "OTP expired" });

    const valid = await bcrypt.compare(otp, user.emailOtp);

    if (!valid)
      return res.status(400).json({ error: "Invalid OTP" });

    // Don't clear OTP yet - we need it for reset/reveal
    res.json({ message: "OTP verified" });
  } catch (err) {
    console.error("Recovery verify OTP error:", err);
    res.status(500).json({ error: "Verification failed" });
  }
};

/* =====================================================
   RECOVERY - RESET PASSWORD
===================================================== */
export const recoveryResetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!newPassword || newPassword.length < 6)
      return res.status(400).json({ error: "Invalid password" });

    const user = await User.findOne({ email });

    if (!user || !user.emailOtp)
      return res.status(400).json({ error: "Invalid request" });

    if (user.emailOtpExpire < Date.now())
      return res.status(400).json({ error: "OTP expired" });

    const valid = await bcrypt.compare(otp, user.emailOtp);

    if (!valid)
      return res.status(400).json({ error: "Invalid OTP" });

    // Update password and clear OTP
    user.password = await bcrypt.hash(newPassword, 10);
    user.emailOtp = null;
    user.emailOtpExpire = null;
    await user.save();

    res.json({ message: "Password reset successfully" });
  } catch (err) {
    console.error("Recovery reset password error:", err);
    res.status(500).json({ error: "Could not reset password" });
  }
};

/* =====================================================
   RECOVERY - GET USERNAME
===================================================== */
export const recoveryGetUsername = async (req, res) => {
  try {
    const { email, otp } = req.body;

    const user = await User.findOne({ email });

    if (!user || !user.emailOtp)
      return res.status(400).json({ error: "Invalid request" });

    if (user.emailOtpExpire < Date.now())
      return res.status(400).json({ error: "OTP expired" });

    const valid = await bcrypt.compare(otp, user.emailOtp);

    if (!valid)
      return res.status(400).json({ error: "Invalid OTP" });

    res.json({ username: user.username });
  } catch (err) {
    console.error("Recovery get username error:", err);
    res.status(500).json({ error: "Could not retrieve username" });
  }
};

/* =====================================================
   OTHER EXISTING FUNCTIONS (ADD YOUR EXISTING ONES)
===================================================== */
export const updateStreak = async (req, res) => {
  // Your existing implementation
  res.json({ message: "Streak updated" });
};

export const saveFcmToken = async (req, res) => {
  try {
    const { fcmToken, platform } = req.body;
    const userId = req.user.userId; // From authMiddleware

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    user.fcmToken = fcmToken;
    user.platform = platform;
    await user.save();

    res.json({ message: "FCM token saved" });
  } catch (err) {
    console.error("Save FCM token error:", err);
    res.status(500).json({ error: "Could not save token" });
  }
};

export const sendNotificationToAll = async (title, body) => {
  // Your existing implementation
  console.log("Sending notification to all users:", title, body);
};

export const deleteAccount = async (req, res) => {
  try {
    const userId = req.user.userId; // From authMiddleware

    await User.findByIdAndDelete(userId);

    res.json({ message: "Account deleted successfully" });
  } catch (err) {
    console.error("Delete account error:", err);
    res.status(500).json({ error: "Could not delete account" });
  }
};

/* =====================================================
   FORGOT PASSWORD - SEND OTP
===================================================== */
export const forgotPasswordSendOtp = async (req, res) => {
  try {
    const { identifier } = req.body; // Can be username or email

    if (!identifier)
      return res.status(400).json({ error: "Username or email required" });

    // Find user by username OR email
    const user = await User.findOne({
      $or: [{ username: identifier }, { email: identifier }]
    });

    if (!user) 
      return res.json({ message: "If account exists, OTP sent" }); // Security: don't reveal if user exists

    if (!checkOtpCooldown(user))
      return res.status(429).json({
        error: "Please wait before requesting another OTP",
      });

    const otp = generateOtp();

    user.emailOtp = await bcrypt.hash(otp, 10);
    user.emailOtpExpire = Date.now() + 5 * 60 * 1000;
    user.otpLastSentAt = Date.now();

    await user.save();
    await sendOtpMail(user.email, otp); // Send to user's email

    res.json({ message: "OTP sent" });
  } catch (err) {
    console.error("Forgot password send OTP error:", err);
    res.status(500).json({ error: "Could not send OTP" });
  }
};

/* =====================================================
   FORGOT PASSWORD - VERIFY OTP
===================================================== */
export const forgotPasswordVerifyOtp = async (req, res) => {
  try {
    const { identifier, otp } = req.body;

    // Find user by username OR email
    const user = await User.findOne({
      $or: [{ username: identifier }, { email: identifier }]
    });

    if (!user || !user.emailOtp)
      return res.status(400).json({ error: "Invalid OTP" });

    if (user.emailOtpExpire < Date.now())
      return res.status(400).json({ error: "OTP expired" });

    const valid = await bcrypt.compare(otp, user.emailOtp);

    if (!valid)
      return res.status(400).json({ error: "Invalid OTP" });

    // Don't clear OTP yet - we need it for password reset
    res.json({ message: "OTP verified" });
  } catch (err) {
    console.error("Forgot password verify OTP error:", err);
    res.status(500).json({ error: "Verification failed" });
  }
};

/* =====================================================
   FORGOT PASSWORD - RESET PASSWORD
===================================================== */
export const forgotPasswordResetPassword = async (req, res) => {
  try {
    const { identifier, otp, newPassword } = req.body;

    if (!newPassword || newPassword.length < 6 || newPassword.length > 8)
      return res.status(400).json({ error: "Password must be 6-8 characters" });

    // Find user by username OR email
    const user = await User.findOne({
      $or: [{ username: identifier }, { email: identifier }]
    });

    if (!user || !user.emailOtp)
      return res.status(400).json({ error: "Invalid request" });

    if (user.emailOtpExpire < Date.now())
      return res.status(400).json({ error: "OTP expired" });

    const valid = await bcrypt.compare(otp, user.emailOtp);

    if (!valid)
      return res.status(400).json({ error: "Invalid OTP" });

    // Update password and clear OTP
    user.password = await bcrypt.hash(newPassword, 10);
    user.emailOtp = null;
    user.emailOtpExpire = null;
    await user.save();

    res.json({ message: "Password reset successfully" });
  } catch (err) {
    console.error("Forgot password reset error:", err);
    res.status(500).json({ error: "Could not reset password" });
  }
};