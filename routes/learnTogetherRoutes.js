import express from "express";
import { z } from "zod";
import auth from "../middleware/auth.js";
import validate from "../middleware/validate.js";
import {
  addComment,
  createLearnPost,
  deleteComment,
  deleteLearnPost,
  listLearnPosts,
  toggleHelpful,
  toggleLike,
  toggleSave,
  updateComment,
  updateLearnPost,
} from "../controllers/learnTogetherController.js";

const router = express.Router();

const postSchema = z.object({
  body: z.object({
    title: z.string().min(2),
    content: z.string().min(2),
    type: z.enum(["article", "video", "workflow", "image", "file"]).optional(),
    videoUrl: z.string().optional(),
    category: z.string().min(2),
    tags: z.array(z.string()).optional(),
    isDraft: z.boolean().optional(),
  }),
});

const updateSchema = z.object({
  body: z.object({
    title: z.string().min(2).optional(),
    content: z.string().min(2).optional(),
    type: z.enum(["article", "video", "workflow", "image", "file"]).optional(),
    videoUrl: z.string().optional(),
    category: z.string().min(2).optional(),
    tags: z.array(z.string()).optional(),
    isDraft: z.boolean().optional(),
    isPinned: z.boolean().optional(),
  }),
  params: z.object({
    id: z.string().min(1),
  }),
});

const idSchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
});

const commentSchema = z.object({
  body: z.object({
    content: z.string().min(1),
  }),
  params: z.object({
    id: z.string().min(1),
  }),
});

const commentUpdateSchema = z.object({
  body: z.object({
    content: z.string().min(1),
  }),
  params: z.object({
    id: z.string().min(1),
    commentId: z.string().min(1),
  }),
});

const commentDeleteSchema = z.object({
  params: z.object({
    id: z.string().min(1),
    commentId: z.string().min(1),
  }),
});

router.get("/posts", auth, listLearnPosts);
router.post("/posts", auth, validate(postSchema), createLearnPost);
router.patch("/posts/:id", auth, validate(updateSchema), updateLearnPost);
router.delete("/posts/:id", auth, validate(idSchema), deleteLearnPost);

router.post("/posts/:id/like", auth, validate(idSchema), toggleLike);
router.post("/posts/:id/save", auth, validate(idSchema), toggleSave);
router.post("/posts/:id/helpful", auth, validate(idSchema), toggleHelpful);

router.post("/posts/:id/comments", auth, validate(commentSchema), addComment);
router.patch("/posts/:id/comments/:commentId", auth, validate(commentUpdateSchema), updateComment);
router.delete("/posts/:id/comments/:commentId", auth, validate(commentDeleteSchema), deleteComment);

export default router;
