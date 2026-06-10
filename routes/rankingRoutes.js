import express from "express";
import auth from "../middleware/auth.js";
import { listRanking } from "../controllers/rankingController.js";

const router = express.Router();

// All authenticated users can view ranking
router.get("/", auth, listRanking);

export default router;
