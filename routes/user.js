import express from "express";
import {
  registerUser,
  verifyRegisterOtp,
  resendRegisterOtp,
  loginUser,
  loginOtp,
  verifyLoginOtp,
  forgotPasswordSendOtp,      // NEW
  forgotPasswordVerifyOtp,    // NEW
  forgotPasswordResetPassword, // NEW
  updateStreak,
  saveFcmToken,
  sendNotificationToAll,
  deleteAccount,
} from "../controllers/userContollers.js";

import { authMiddleware } from "../utils/authMiddleware.js";

const router = express.Router();

/* =====================================================
   AUTH ROUTES - REGISTER
===================================================== */
router.post("/auth/register", registerUser);
router.post("/auth/verify-register-otp", verifyRegisterOtp);
router.post("/auth/resend-register-otp", resendRegisterOtp);

/* =====================================================
   AUTH ROUTES - LOGIN
===================================================== */
// Login with username or email + password
router.post("/auth/login", loginUser); // Changed endpoint name for clarity

// Login with email OTP (optional, if you still want this)
router.post("/auth/login-otp", loginOtp);
router.post("/auth/verify-login-otp", verifyLoginOtp);

/* =====================================================
   AUTH ROUTES - FORGOT PASSWORD
===================================================== */
router.post("/auth/forgot-password/send-otp", forgotPasswordSendOtp);
router.post("/auth/forgot-password/verify-otp", forgotPasswordVerifyOtp);
router.post("/auth/forgot-password/reset-password", forgotPasswordResetPassword);

/* =====================================================
   PROTECTED ROUTES
===================================================== */
router.post("/streak", authMiddleware, updateStreak);
router.post("/register-token", authMiddleware, saveFcmToken);
router.delete("/me", authMiddleware, deleteAccount);

/* =====================================================
   ADMIN / TEST ROUTES
===================================================== */
router.post("/notify", async (req, res) => {
  const { title, body } = req.body;

  if (!title || !body) {
    return res.status(400).json({ error: "title & body required" });
  }

  await sendNotificationToAll(title, body);

  res.json({ message: "Notification sent" });
});

export default router;