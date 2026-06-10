import asyncHandler from "../utils/asyncHandler.js";
import bcrypt from "bcryptjs";
import User from "../models/User.js";
import { ROLES, APPROVAL_STATUS, EMPLOYEE_STATUS } from "../config/constants.js";
import { signToken } from "../utils/token.js";
import sendEmail from "../utils/mailer.js";

const OTP_TTL_MINUTES = 5;

const generateOtp = () => {
  return String(Math.floor(100000 + Math.random() * 900000));
};

const buildOtpEmail = ({ name, otp, purpose }) => {
  const heading =
    purpose === "reset-password" ? "Reset your password" : "Verify your email";
  const subtitle =
    purpose === "reset-password"
      ? "Use this OTP to reset your password."
      : "Use this OTP to verify your account.";

  return `
  <div style="font-family: 'Segoe UI', Arial, sans-serif; background:#f8fafc; padding:24px;">
    <div style="max-width:520px; margin:0 auto; background:#ffffff; border:1px solid #e2e8f0; border-radius:16px; overflow:hidden;">
      <div style="background:#0f172a; color:#ffffff; padding:20px 24px;">
        <p style="margin:0; font-size:12px; letter-spacing:3px; text-transform:uppercase; color:#a7f3d0;">Team Management Portal</p>
        <h1 style="margin:8px 0 0; font-size:20px;">${heading}</h1>
      </div>
      <div style="padding:24px;">
        <p style="margin:0 0 8px; color:#0f172a; font-size:14px;">Hi ${name},</p>
        <p style="margin:0 0 16px; color:#475569; font-size:14px;">${subtitle}</p>
        <div style="background:#f1f5f9; border-radius:12px; padding:16px; text-align:center;">
          <p style="margin:0 0 8px; color:#475569; font-size:12px;">Your OTP</p>
          <p style="margin:0; font-size:28px; letter-spacing:6px; font-weight:700; color:#0f172a;">${otp}</p>
        </div>
        <p style="margin:16px 0 0; color:#64748b; font-size:12px;">This OTP will expire in ${OTP_TTL_MINUTES} minutes.</p>
      </div>
    </div>
  </div>
  `;
};

export const register = asyncHandler(async (req, res) => {
  const { name, email, employeeId, serviceLine, team, password, profileImage } = req.validated.body;

  const existing = await User.findOne({
    $or: [{ email }, { employeeId }],
  });
  if (existing) {
    return res.status(409).json({ message: "User already exists" });
  }

  const user = await User.create({
    name,
    email,
    employeeId,
    serviceLine,
    team,
    password,
    profileImage,
    role: ROLES.MEMBER,
  });

  const otp = generateOtp();
  user.otpCodeHash = await bcrypt.hash(otp, 10);
  user.otpExpiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);
  user.otpPurpose = "verify-email";
  await user.save();

  await sendEmail({
    to: user.email,
    subject: "Verify your email",
    html: buildOtpEmail({ name: user.name, otp, purpose: "verify-email" }),
  });

  res.status(201).json({
    message: "Registration successful. Please verify your email.",
  });
});

export const verifyOtp = asyncHandler(async (req, res) => {
  const { email, otp, purpose } = req.validated.body;
  const user = await User.findOne({ email });
  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  if (!user.otpCodeHash || !user.otpExpiresAt) {
    return res.status(400).json({ message: "OTP not requested" });
  }

  if (user.otpPurpose !== purpose) {
    return res.status(400).json({ message: "OTP purpose mismatch" });
  }

  if (user.otpExpiresAt.getTime() < Date.now()) {
    return res.status(400).json({ message: "OTP expired" });
  }

  const match = await bcrypt.compare(otp, user.otpCodeHash);
  if (!match) {
    return res.status(400).json({ message: "Invalid OTP" });
  }

  if (purpose === "verify-email") {
    user.emailVerified = true;
  }

  user.otpCodeHash = undefined;
  user.otpExpiresAt = undefined;
  user.otpPurpose = undefined;
  await user.save();

  res.status(200).json({ message: "OTP verified successfully" });
});

export const resendOtp = asyncHandler(async (req, res) => {
  const { email } = req.validated.body;
  const user = await User.findOne({ email });
  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  if (user.emailVerified) {
    return res.status(400).json({ message: "Email already verified" });
  }

  const otp = generateOtp();
  user.otpCodeHash = await bcrypt.hash(otp, 10);
  user.otpExpiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);
  user.otpPurpose = "verify-email";
  await user.save();

  await sendEmail({
    to: user.email,
    subject: "Verify your email",
    html: buildOtpEmail({ name: user.name, otp, purpose: "verify-email" }),
  });

  res.status(200).json({ message: "OTP resent successfully" });
});

export const requestPasswordReset = asyncHandler(async (req, res) => {
  const { email } = req.validated.body;
  const user = await User.findOne({ email });
  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  const otp = generateOtp();
  user.otpCodeHash = await bcrypt.hash(otp, 10);
  user.otpExpiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);
  user.otpPurpose = "reset-password";
  await user.save();

  await sendEmail({
    to: user.email,
    subject: "Reset your password",
    html: buildOtpEmail({ name: user.name, otp, purpose: "reset-password" }),
  });

  res.status(200).json({ message: "OTP sent for password reset" });
});

export const resetPassword = asyncHandler(async (req, res) => {
  const { email, otp, password } = req.validated.body;
  const user = await User.findOne({ email });
  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  if (!user.otpCodeHash || !user.otpExpiresAt || user.otpPurpose !== "reset-password") {
    return res.status(400).json({ message: "OTP not requested" });
  }

  if (user.otpExpiresAt.getTime() < Date.now()) {
    return res.status(400).json({ message: "OTP expired" });
  }

  const match = await bcrypt.compare(otp, user.otpCodeHash);
  if (!match) {
    return res.status(400).json({ message: "Invalid OTP" });
  }

  user.password = password;
  user.otpCodeHash = undefined;
  user.otpExpiresAt = undefined;
  user.otpPurpose = undefined;
  await user.save();

  res.status(200).json({ message: "Password reset successfully" });
});

export const changePassword = asyncHandler(async (req, res) => {
  const { oldPassword, newPassword } = req.validated.body;
  const user = await User.findById(req.user._id);
  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  const match = await user.comparePassword(oldPassword);
  if (!match) {
    return res.status(400).json({ message: "Current password is incorrect" });
  }

  user.password = newPassword;
  await user.save();

  res.status(200).json({ message: "Password changed successfully" });
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.validated.body;

  const user = await User.findOne({ email }).populate("serviceLine team");
  if (!user) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  const passwordMatch = await user.comparePassword(password);
  if (!passwordMatch) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  if (!user.emailVerified) {
    return res.status(403).json({ message: "Email not verified" });
  }

  if (user.approvalStatus !== APPROVAL_STATUS.APPROVED) {
    return res.status(403).json({ message: "Account not approved yet" });
  }

  if (user.status === EMPLOYEE_STATUS.INACTIVE) {
    return res.status(403).json({
      message: "Account inactive. Please contact project manager or team leader.",
    });
  }

  const token = signToken({ id: user._id, role: user.role });

  res.status(200).json({
    token,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      serviceLine: user.serviceLine,
      team: user.team,
    },
  });
});

export const me = asyncHandler(async (req, res) => {
  res.status(200).json({ user: req.user });
});
