import dotenv from "dotenv";
import { APPROVAL_STATUS, ROLES } from "../config/constants.js";
import connectDB from "../config/db.js";
import User from "../models/User.js";

dotenv.config();

const seedSuperAdmin = async () => {
  const email = process.env.SUPER_ADMIN_EMAIL || "monir.bdcalling@gmail.com";
  const password = process.env.SUPER_ADMIN_PASSWORD || "123456789";
  const employeeId = process.env.SUPER_ADMIN_EMPLOYEE_ID || "SA-17114";
  const name = process.env.SUPER_ADMIN_NAME || "Monir Hossain";

  await connectDB();

  let user = await User.findOne({ email });
  if (!user) {
    user = await User.create({
      name,
      email,
      employeeId,
      password,
      role: ROLES.SUPER_ADMIN,
      emailVerified: true,
      approvalStatus: APPROVAL_STATUS.APPROVED,
      approvedAt: new Date(),
    });
    console.log("Super admin created:", user.email);
  } else {
    user.name = name;
    user.employeeId = employeeId;
    user.role = ROLES.SUPER_ADMIN;
    user.emailVerified = true;
    user.approvalStatus = APPROVAL_STATUS.APPROVED;
    user.approvedAt = new Date();
    user.password = password;
    await user.save();
    console.log("Super admin updated:", user.email);
  }

  process.exit(0);
};

seedSuperAdmin().catch((error) => {
  console.error("Seed failed", error);
  process.exit(1);
});
