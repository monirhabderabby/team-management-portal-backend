import express from "express";
import { z } from "zod";
import auth from "../middleware/auth.js";
import requireRole from "../middleware/rbac.js";
import validate from "../middleware/validate.js";
import { ROLES } from "../config/constants.js";
import {
  getMaintenanceStatus,
  updateMaintenanceStatus,
} from "../controllers/appSettingController.js";

const router = express.Router();

const updateSchema = z.object({
  body: z.object({
    enabled: z.boolean(),
  }),
});

router.get("/maintenance", getMaintenanceStatus);
router.patch(
  "/maintenance",
  auth,
  requireRole(ROLES.SUPER_ADMIN),
  validate(updateSchema),
  updateMaintenanceStatus
);

export default router;
