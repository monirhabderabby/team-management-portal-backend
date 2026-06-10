import mongoose from "mongoose";

const commentSchema = new mongoose.Schema(
  {
    author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    content: { type: String, required: true, trim: true },
    edited: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const learnPostSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    content: { type: String, required: true },
    type: {
      type: String,
      enum: ["article", "video", "workflow", "image", "file"],
      default: "article",
    },
    videoUrl: { type: String, default: "" },
    category: { type: String, required: true },
    tags: { type: [String], default: [] },
    readingTime: { type: String, default: "2 min read" },
    views: { type: Number, default: 0 },
    likedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    savedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    helpfulBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    isPinned: { type: Boolean, default: false },
    isDraft: { type: Boolean, default: false },
    author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    comments: { type: [commentSchema], default: [] },
  },
  { timestamps: true }
);

const LearnPost = mongoose.model("LearnPost", learnPostSchema);

export default LearnPost;
