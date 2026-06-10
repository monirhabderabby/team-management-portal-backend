import express from "express";
import { z } from "zod";
import auth from "../middleware/auth.js";
import validate from "../middleware/validate.js";
import {
  addProjectRemark,
  deleteProjectRemark,
  createProject,
  deleteProject,
  listProjectTimeline,
  listProjects,
  listProjectMetrics,
  listScopedProjectMetrics,
  listProjectWipOverview,
  updateProject,
} from "../controllers/projectController.js";

const router = express.Router();

const statusEnum = ["WIP", "Delivered", "Cancelled", "Revision", "Hold"];

const createSchema = z.object({
  body: z.object({
    clientName: z.string().min(2),
    profileName: z.string().min(2),
    orderId: z.string().min(2),
    employeeId: z.string().optional(),
    serviceLine: z.string().optional(),
    team: z.string().optional(),
    amount: z.number().min(0),
    startDate: z.string(),
    deadline: z.string(),
    nextWipDeadline: z.string(),
    deliveryDate: z.string().optional(),
    status: z.enum(statusEnum),
    remarks: z.string().optional(),
    instructionSheet: z.string().url(),
    clientRating: z.number().min(1).max(5).optional(),
  }),
});

const updateSchema = z.object({
  body: z.object({
    clientName: z.string().min(2).optional(),
    profileName: z.string().min(2).optional(),
    orderId: z.string().min(2).optional(),
    employeeId: z.string().optional(),
    serviceLine: z.string().optional(),
    team: z.string().optional(),
    amount: z.number().min(0).optional(),
    startDate: z.string().optional(),
    deadline: z.string().optional(),
    nextWipDeadline: z.string().optional(),
    deliveryDate: z.string().optional(),
    status: z.enum(statusEnum).optional(),
    instructionSheet: z.string().url().optional(),
    clientRating: z.number().min(1).max(5).optional(),
  }),
});

const remarkSchema = z.object({
  body: z.object({
    text: z.string().min(1),
  }),
});

const deleteRemarkSchema = z.object({
  params: z.object({
    id: z.string().min(1),
    remarkId: z.string().min(1),
  }),
});

router.get("/", auth, listProjects);
router.get("/metrics", auth, listProjectMetrics);
router.get("/metrics-scope", auth, listScopedProjectMetrics);
router.get("/wip-overview", auth, listProjectWipOverview);
router.get("/timeline", auth, listProjectTimeline);
router.post("/", auth, validate(createSchema), createProject);
router.patch("/:id", auth, validate(updateSchema), updateProject);
router.delete("/:id", auth, deleteProject);
router.post("/:id/remarks", auth, validate(remarkSchema), addProjectRemark);
router.delete(
  "/:id/remarks/:remarkId",
  auth,
  validate(deleteRemarkSchema),
  deleteProjectRemark
);

export default router;
