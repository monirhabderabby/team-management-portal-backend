import express from "express";
import { z } from "zod";
import validate from "../middleware/validate.js";
import {
  login,
  me,
  register,
  requestPasswordReset,
  resetPassword,
  changePassword,
  verifyOtp,
  resendOtp,
} from "../controllers/authController.js";
import auth from "../middleware/auth.js";

const router = express.Router();

const registerSchema = z.object({
  body: z.object({
    name: z.string().min(2),
    email: z.string().email(),
    employeeId: z.string().min(3),
    serviceLine: z.string().optional(),
    team: z.string().optional(),
    password: z.string().min(6),
    profileImage: z.string().optional(),
  }),
});

const loginSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(6),
  }),
});

const verifyOtpSchema = z.object({
  body: z.object({
    email: z.string().email(),
    otp: z.string().min(6).max(6),
    purpose: z.enum(["verify-email", "reset-password"]),
  }),
});

const requestResetSchema = z.object({
  body: z.object({
    email: z.string().email(),
  }),
});

const resetPasswordSchema = z.object({
  body: z.object({
    email: z.string().email(),
    otp: z.string().min(6).max(6),
    password: z.string().min(6),
  }),
});

const changePasswordSchema = z.object({
  body: z.object({
    oldPassword: z.string().min(6),
    newPassword: z.string().min(6),
  }),
});

router.post("/register", validate(registerSchema), register);
router.post("/login", validate(loginSchema), login);
router.post("/verify-otp", validate(verifyOtpSchema), verifyOtp);
router.post("/resend-otp", validate(requestResetSchema), resendOtp);
router.post(
  "/request-password-reset",
  validate(requestResetSchema),
  requestPasswordReset
);
router.post("/reset-password", validate(resetPasswordSchema), resetPassword);
router.post(
  "/change-password",
  auth,
  validate(changePasswordSchema),
  changePassword
);
router.get("/me", auth, me);

export default router;
