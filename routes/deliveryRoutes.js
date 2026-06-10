import express from "express";
import { z } from "zod";
import auth from "../middleware/auth.js";
import requireRole from "../middleware/rbac.js";
import validate from "../middleware/validate.js";
import { ROLES } from "../config/constants.js";
import {
  listDeliverySummary,
  setTeamDeliveryTarget,
} from "../controllers/deliveryController.js";

const router = express.Router();

const targetSchema = z.object({
  body: z.object({
    teamTarget: z.number().min(0),
    month: z.number().int().min(1).max(12),
    year: z.number().int().min(2020).max(2100),
  }),
});

router.get(
  "/summary",
  auth,
  requireRole(ROLES.SUPER_ADMIN, ROLES.PROJECT_MANAGER, ROLES.TEAM_LEADER),
  listDeliverySummary
);

router.patch(
  "/team-target/:id",
  auth,
  requireRole(ROLES.SUPER_ADMIN, ROLES.PROJECT_MANAGER),
  validate(targetSchema),
  setTeamDeliveryTarget
);

export default router;
