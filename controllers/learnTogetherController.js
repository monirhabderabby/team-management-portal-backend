import asyncHandler from "../utils/asyncHandler.js";
import LearnPost from "../models/LearnPost.js";
import { ROLES } from "../config/constants.js";

const buildReadingTime = (type, content) => {
  const words = String(content || "")
    .split(/\s+/)
    .filter(Boolean).length;
  const minutes = Math.max(2, Math.ceil(words / 200));
  if (type === "video") return `${minutes} min video`;
  return `${minutes} min read`;
};

const toPostPayload = (post, userId) => {
  const author = post.author || {};
  const authorTeam = author?.team?.name || author?.team || "Learning Hub";
  const likedBy = post.likedBy || [];
  const savedBy = post.savedBy || [];
  const helpfulBy = post.helpfulBy || [];

  return {
    id: String(post._id),
    title: post.title,
    content: post.content,
    type: post.type,
    videoUrl: post.videoUrl || "",
    author: {
      name: author.name || "Anonymous",
      role: author.role || ROLES.MEMBER,
      avatar: author.profileImage || "",
      team: authorTeam || "Learning Hub",
    },
    authorId: String(author._id || post.author),
    category: post.category,
    tags: post.tags || [],
    readingTime: post.readingTime || buildReadingTime(post.type, post.content),
    views: post.views || 0,
    likes: likedBy.length,
    helpfulCount: helpfulBy.length,
    comments: (post.comments || []).map((comment) => ({
      id: String(comment._id),
      author: comment.author?.name || "Anonymous",
      role: comment.author?.role || ROLES.MEMBER,
      avatar: comment.author?.profileImage || "",
      content: comment.content,
      time: comment.createdAt,
      edited: !!comment.edited,
    })),
    isSaved: savedBy.some((id) => String(id) === String(userId)),
    isLiked: likedBy.some((id) => String(id) === String(userId)),
    isHelpful: helpfulBy.some((id) => String(id) === String(userId)),
    isPinned: !!post.isPinned,
    isDraft: !!post.isDraft,
    date: post.createdAt,
    updatedAt: post.updatedAt,
  };
};

const canManagePost = (post, user) => {
  if (!post || !user) return false;
  if (user.role === ROLES.SUPER_ADMIN) return true;
  if (user.role === ROLES.PROJECT_MANAGER) return true;
  return String(post.author?._id || post.author) === String(user._id);
};

export const listLearnPosts = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 9));
  const search = String(req.query.search || "").trim();
  const category = String(req.query.category || "All").trim();
  const sort = String(req.query.sort || "newest").trim();
  const tab = String(req.query.tab || "explore").trim();

  const filter = {};

  if (tab === "drafts") {
    filter.isDraft = true;
    filter.author = req.user._id;
  } else if (tab === "saved") {
    filter.isDraft = false;
    filter.savedBy = req.user._id;
  } else if (tab === "contributions") {
    filter.isDraft = false;
    filter.author = req.user._id;
  } else {
    filter.isDraft = false;
  }

  if (category && category !== "All") {
    filter.category = category;
  }

  if (search) {
    const pattern = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter.$or = [{ title: pattern }, { content: pattern }, { tags: pattern }];
  }

  const posts = await LearnPost.find(filter)
    .populate({
      path: "author",
      select: "name role profileImage team",
      populate: { path: "team", select: "name" },
    })
    .populate({
      path: "comments.author",
      select: "name role profileImage team",
      populate: { path: "team", select: "name" },
    });

  const mapped = posts.map((post) => toPostPayload(post, req.user._id));

  const sorted = mapped.sort((a, b) => {
    if (sort === "popular") return b.likes - a.likes;
    if (sort === "helpful") return b.helpfulCount - a.helpfulCount;
    return new Date(b.date) - new Date(a.date);
  });

  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * limit;
  const paged = sorted.slice(start, start + limit);

  res.status(200).json({
    data: paged,
    meta: {
      page: safePage,
      limit,
      total,
      totalPages,
    },
  });
});

export const createLearnPost = asyncHandler(async (req, res) => {
  const { title, content, type, videoUrl, category, tags, isDraft } = req.validated.body;

  const post = await LearnPost.create({
    title,
    content,
    type,
    videoUrl: videoUrl || "",
    category,
    tags: Array.isArray(tags) ? tags : [],
    isDraft: !!isDraft,
    author: req.user._id,
    readingTime: buildReadingTime(type, content),
  });

  await post.populate({
    path: "author",
    select: "name role profileImage team",
    populate: { path: "team", select: "name" },
  });

  res.status(201).json({ data: toPostPayload(post, req.user._id) });
});

export const updateLearnPost = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { title, content, type, videoUrl, category, tags, isDraft, isPinned } = req.validated.body;

  const post = await LearnPost.findById(id)
    .populate({
      path: "author",
      select: "name role profileImage team",
      populate: { path: "team", select: "name" },
    })
    .populate({
      path: "comments.author",
      select: "name role profileImage team",
      populate: { path: "team", select: "name" },
    });

  if (!post) {
    return res.status(404).json({ message: "Post not found" });
  }

  if (!canManagePost(post, req.user)) {
    return res.status(403).json({ message: "Forbidden" });
  }

  if (typeof title !== "undefined") post.title = title;
  if (typeof content !== "undefined") post.content = content;
  if (typeof type !== "undefined") post.type = type;
  if (typeof videoUrl !== "undefined") post.videoUrl = videoUrl;
  if (typeof category !== "undefined") post.category = category;
  if (typeof tags !== "undefined") post.tags = Array.isArray(tags) ? tags : [];
  if (typeof isDraft !== "undefined") post.isDraft = !!isDraft;
  if (typeof isPinned !== "undefined") post.isPinned = !!isPinned;

  post.readingTime = buildReadingTime(post.type, post.content);
  await post.save();

  res.status(200).json({ data: toPostPayload(post, req.user._id) });
});

export const deleteLearnPost = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const post = await LearnPost.findById(id);
  if (!post) {
    return res.status(404).json({ message: "Post not found" });
  }
  if (!canManagePost(post, req.user)) {
    return res.status(403).json({ message: "Forbidden" });
  }
  await post.deleteOne();
  res.status(200).json({ message: "Post deleted" });
});

export const toggleLike = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const post = await LearnPost.findById(id)
    .populate({
      path: "author",
      select: "name role profileImage team",
      populate: { path: "team", select: "name" },
    })
    .populate({
      path: "comments.author",
      select: "name role profileImage team",
      populate: { path: "team", select: "name" },
    });
  if (!post) return res.status(404).json({ message: "Post not found" });

  const exists = post.likedBy.some((userId) => String(userId) === String(req.user._id));
  if (exists) {
    post.likedBy = post.likedBy.filter((userId) => String(userId) !== String(req.user._id));
  } else {
    post.likedBy.push(req.user._id);
  }
  await post.save();

  res.status(200).json({ data: toPostPayload(post, req.user._id) });
});

export const toggleSave = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const post = await LearnPost.findById(id)
    .populate({
      path: "author",
      select: "name role profileImage team",
      populate: { path: "team", select: "name" },
    })
    .populate({
      path: "comments.author",
      select: "name role profileImage team",
      populate: { path: "team", select: "name" },
    });
  if (!post) return res.status(404).json({ message: "Post not found" });

  const exists = post.savedBy.some((userId) => String(userId) === String(req.user._id));
  if (exists) {
    post.savedBy = post.savedBy.filter((userId) => String(userId) !== String(req.user._id));
  } else {
    post.savedBy.push(req.user._id);
  }
  await post.save();

  res.status(200).json({ data: toPostPayload(post, req.user._id) });
});

export const toggleHelpful = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const post = await LearnPost.findById(id)
    .populate({
      path: "author",
      select: "name role profileImage team",
      populate: { path: "team", select: "name" },
    })
    .populate({
      path: "comments.author",
      select: "name role profileImage team",
      populate: { path: "team", select: "name" },
    });
  if (!post) return res.status(404).json({ message: "Post not found" });

  const exists = post.helpfulBy.some((userId) => String(userId) === String(req.user._id));
  if (exists) {
    post.helpfulBy = post.helpfulBy.filter((userId) => String(userId) !== String(req.user._id));
  } else {
    post.helpfulBy.push(req.user._id);
  }
  await post.save();

  res.status(200).json({ data: toPostPayload(post, req.user._id) });
});

export const addComment = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { content } = req.validated.body;

  const post = await LearnPost.findById(id);
  if (!post) return res.status(404).json({ message: "Post not found" });

  post.comments.unshift({ author: req.user._id, content });
  await post.save();

  await post.populate({
    path: "author",
    select: "name role profileImage team",
    populate: { path: "team", select: "name" },
  });
  await post.populate({
    path: "comments.author",
    select: "name role profileImage team",
    populate: { path: "team", select: "name" },
  });

  res.status(200).json({ data: toPostPayload(post, req.user._id) });
});

export const updateComment = asyncHandler(async (req, res) => {
  const { id, commentId } = req.params;
  const { content } = req.validated.body;

  const post = await LearnPost.findById(id);
  if (!post) return res.status(404).json({ message: "Post not found" });

  const comment = post.comments.id(commentId);
  if (!comment) return res.status(404).json({ message: "Comment not found" });

  const canEditComment =
    String(comment.author) === String(req.user._id) || req.user.role === ROLES.SUPER_ADMIN;
  if (!canEditComment) return res.status(403).json({ message: "Forbidden" });

  comment.content = content;
  comment.edited = true;
  await post.save();

  await post.populate({
    path: "author",
    select: "name role profileImage team",
    populate: { path: "team", select: "name" },
  });
  await post.populate({
    path: "comments.author",
    select: "name role profileImage team",
    populate: { path: "team", select: "name" },
  });

  res.status(200).json({ data: toPostPayload(post, req.user._id) });
});

export const deleteComment = asyncHandler(async (req, res) => {
  const { id, commentId } = req.params;

  const post = await LearnPost.findById(id);
  if (!post) return res.status(404).json({ message: "Post not found" });

  const comment = post.comments.id(commentId);
  if (!comment) return res.status(404).json({ message: "Comment not found" });

  const canEditComment =
    String(comment.author) === String(req.user._id) || req.user.role === ROLES.SUPER_ADMIN;
  if (!canEditComment) return res.status(403).json({ message: "Forbidden" });

  comment.deleteOne();
  await post.save();

  await post.populate({
    path: "author",
    select: "name role profileImage team",
    populate: { path: "team", select: "name" },
  });
  await post.populate({
    path: "comments.author",
    select: "name role profileImage team",
    populate: { path: "team", select: "name" },
  });

  res.status(200).json({ data: toPostPayload(post, req.user._id) });
});
