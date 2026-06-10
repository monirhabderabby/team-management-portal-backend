import express from "express";
import { z } from "zod";
import auth from "../middleware/auth.js";
import requireRole from "../middleware/rbac.js";
import validate from "../middleware/validate.js";
import { ROLES, APPROVAL_STATUS } from "../config/constants.js";
import {
  approveUser,
  assignUser,
  createProjectManager,
  deleteUser,
  getMyProfile,
  listUsers,
  updateUserAdmin,
  updateUserStatus,
  updateUserTarget,
  updateMyProfile,
} from "../controllers/userController.js";

const router = express.Router();

const approveSchema = z.object({
  body: z.object({
    approvalStatus: z.enum([
      APPROVAL_STATUS.APPROVED,
      APPROVAL_STATUS.REJECTED,
      APPROVAL_STATUS.PENDING,
    ]),
  }),
});

const assignSchema = z.object({
  body: z.object({
    role: z.enum(Object.values(ROLES)).optional(),
    serviceLine: z.string().optional(),
    team: z.string().optional(),
  }),
});

const projectManagerSchema = z.object({
  body: z.object({
    name: z.string().min(2),
    email: z.string().email(),
    employeeId: z.string().min(3),
    password: z.string().min(6),
    serviceLine: z.string().min(3),
  }),
});

const statusSchema = z.object({
  body: z.object({
    status: z.enum(["active", "inactive"]),
  }),
});

const targetSchema = z.object({
  body: z.object({
    monthlyTarget: z.number().min(0),
  }),
});

const updateProfileSchema = z.object({
  body: z.object({
    name: z.string().min(2).optional(),
    phone: z.string().optional(),
    officeEmail: z.string().email().optional(),
    dateOfBirth: z.string().optional(),
    presentAddress: z.string().optional(),
    permanentAddress: z.string().optional(),
    profileImage: z.string().optional(),
  }),
});


router.get(
  "/",
  auth,
  requireRole(ROLES.SUPER_ADMIN, ROLES.PROJECT_MANAGER, ROLES.TEAM_LEADER, ROLES.MEMBER),
  listUsers
);
router.get("/me", auth, getMyProfile);
router.patch("/me", auth, validate(updateProfileSchema), updateMyProfile);
router.patch(
  "/:id/approve",
  auth,
  requireRole(ROLES.SUPER_ADMIN, ROLES.PROJECT_MANAGER, ROLES.TEAM_LEADER),
  validate(approveSchema),
  approveUser
);
router.patch(
  "/:id/assign",
  auth,
  requireRole(ROLES.SUPER_ADMIN, ROLES.PROJECT_MANAGER),
  validate(assignSchema),
  assignUser
);
router.post(
  "/project-managers",
  auth,
  requireRole(ROLES.SUPER_ADMIN),
  validate(projectManagerSchema),
  createProjectManager
);
router.patch(
  "/:id/status",
  auth,
  requireRole(ROLES.SUPER_ADMIN, ROLES.PROJECT_MANAGER, ROLES.TEAM_LEADER),
  validate(statusSchema),
  updateUserStatus
);
router.patch(
  "/:id/target",
  auth,
  requireRole(ROLES.SUPER_ADMIN, ROLES.PROJECT_MANAGER, ROLES.TEAM_LEADER),
  validate(targetSchema),
  updateUserTarget
);
router.patch(
  "/:id/admin",
  auth,
  requireRole(ROLES.SUPER_ADMIN),
  updateUserAdmin
);
router.delete(
  "/:id",
  auth,
  requireRole(ROLES.SUPER_ADMIN, ROLES.PROJECT_MANAGER, ROLES.TEAM_LEADER),
  deleteUser
);

export default router;
