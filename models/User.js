import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { APPROVAL_STATUS, EMPLOYEE_STATUS, ROLES } from "../config/constants.js";

const userSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true },
        email: { type: String, required: true, unique: true, lowercase: true },
        employeeId: { type: String, required: true, unique: true, trim: true },
        password: { type: String, required: true },
        role: {
            type: String,
            enum: Object.values(ROLES),
            default: ROLES.MEMBER,
        },
        serviceLine: { type: mongoose.Schema.Types.ObjectId, ref: "ServiceLine" },
        team: { type: mongoose.Schema.Types.ObjectId, ref: "Team" },
        joinDate: { type: Date, default: Date.now },
        monthlyTarget: { type: Number, default: 1100 },
        status: {
            type: String,
            enum: Object.values(EMPLOYEE_STATUS),
            default: EMPLOYEE_STATUS.ACTIVE,
        },
        profileImage: { type: String },
        officeEmail: { type: String, lowercase: true },
        phone: { type: String },
        dateOfBirth: { type: Date },
        presentAddress: { type: String },
        permanentAddress: { type: String },
        emailVerified: { type: Boolean, default: false },
        otpCodeHash: { type: String },
        otpExpiresAt: { type: Date },
        otpPurpose: { type: String },
        approvalStatus: {
            type: String,
            enum: Object.values(APPROVAL_STATUS),
            default: APPROVAL_STATUS.PENDING,
        },
        approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        approvedAt: { type: Date },
    },
    { timestamps: true }
);

userSchema.pre("save", async function hashPassword(next) {
    if (!this.isModified("password")) return next();
    this.password = await bcrypt.hash(this.password, 10);
    return next();
});

userSchema.methods.comparePassword = async function comparePassword(value) {
    return bcrypt.compare(value, this.password);
};

const User = mongoose.model("User", userSchema);

export default User;
