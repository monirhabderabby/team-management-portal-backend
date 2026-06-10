import express from "express";
import { z } from "zod";
import auth from "../middleware/auth.js";
import requireRole from "../middleware/rbac.js";
import validate from "../middleware/validate.js";
import { ROLES } from "../config/constants.js";
import {
  createServiceLine,
  deleteServiceLine,
  listServiceLines,
  listServiceLineSummary,
  updateServiceLine,
} from "../controllers/serviceLineController.js";

const router = express.Router();

const createSchema = z.object({
  body: z.object({
    name: z.string().min(2),
  }),
});

const updateSchema = z.object({
  body: z.object({
    name: z.string().min(2).optional(),
    status: z.string().optional(),
  }),
});

router.get("/", auth, listServiceLines);
router.get("/public", listServiceLines);
router.get(
  "/summary",
  auth,
  requireRole(ROLES.SUPER_ADMIN),
  listServiceLineSummary
);
router.post(
  "/",
  auth,
  requireRole(ROLES.SUPER_ADMIN),
  validate(createSchema),
  createServiceLine
);
router.patch(
  "/:id",
  auth,
  requireRole(ROLES.SUPER_ADMIN),
  validate(updateSchema),
  updateServiceLine
);
router.delete(
  "/:id",
  auth,
  requireRole(ROLES.SUPER_ADMIN),
  deleteServiceLine
);

export default router;
