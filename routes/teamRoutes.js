import express from "express";
import { z } from "zod";
import auth from "../middleware/auth.js";
import requireRole from "../middleware/rbac.js";
import validate from "../middleware/validate.js";
import { ROLES } from "../config/constants.js";
import {
  createTeam,
  deleteTeam,
  listTeams,
  listTeamSummary,
  updateTeam,
} from "../controllers/teamController.js";

const router = express.Router();

const createSchema = z.object({
  body: z.object({
    name: z.string().min(2),
    serviceLine: z.string().min(3),
  }),
});

const updateSchema = z.object({
  body: z.object({
    name: z.string().min(2).optional(),
    status: z.string().optional(),
    teamTarget: z.number().min(0).optional(),
  }),
});

router.get("/", auth, listTeams);
router.get("/public", listTeams);
router.get(
  "/summary",
  auth,
  requireRole(ROLES.SUPER_ADMIN, ROLES.PROJECT_MANAGER),
  listTeamSummary
);
router.post(
  "/",
  auth,
  requireRole(ROLES.SUPER_ADMIN, ROLES.PROJECT_MANAGER),
  validate(createSchema),
  createTeam
);
router.patch(
  "/:id",
  auth,
  requireRole(ROLES.SUPER_ADMIN, ROLES.PROJECT_MANAGER),
  validate(updateSchema),
  updateTeam
);
router.delete(
  "/:id",
  auth,
  requireRole(ROLES.SUPER_ADMIN, ROLES.PROJECT_MANAGER),
  deleteTeam
);

export default router;
