import asyncHandler from "../utils/asyncHandler.js";
import Announcement from "../models/Announcement.js";
import { ROLES } from "../config/constants.js";

const toAnnouncementPayload = (announcement, userId) => {
  const author = announcement.author || {};
  const isRead = Array.isArray(announcement.readBy)
    ? announcement.readBy.some((id) => String(id) === String(userId))
    : false;

  return {
    id: String(announcement._id),
    title: announcement.title,
    description: announcement.description,
    date: announcement.createdAt,
    updatedAt: announcement.updatedAt,
    author: {
      name: author.name || "Unknown",
      role: author.role || "MEMBER",
      image: author.profileImage || "",
    },
    // Expose scope so frontend knows who created it
    teamId: announcement.team ? String(announcement.team) : null,
    serviceLineId: announcement.serviceLine ? String(announcement.serviceLine) : null,
    authorId: String(announcement.author?._id || announcement.author || ""),
    isRead,
  };
};

/**
 * Build the visibility filter for the requesting user:
 *
 * SUPER_ADMIN       → sees everything
 * PROJECT_MANAGER   → sees:
 *                      (a) global announcements (team == null) from their serviceLine or SA
 *                      (b) team-scoped announcements whose serviceLine matches theirs
 * TEAM_LEADER       → sees:
 *                      (a) global announcements from their serviceLine PM / SA
 *                      (b) team-scoped announcements for their own team
 * MEMBER            → sees:
 *                      (a) global announcements from their serviceLine PM / SA
 *                      (b) team-scoped announcements for their own team
 */
const buildVisibilityFilter = (user) => {
  if (user.role === ROLES.SUPER_ADMIN) {
    return {}; // sees all
  }

  const userServiceLine = user.serviceLine ? String(user.serviceLine) : null;
  const userTeam = user.team ? String(user.team) : null;

  if (user.role === ROLES.PROJECT_MANAGER) {
    // Sees: global announcements in their service line OR any team-scoped ones in their service line
    return {
      $or: [
        { team: null, serviceLine: user.serviceLine },     // PM/SA global for this service line
        { team: null, serviceLine: null },                  // SA-level global (no scope)
        { serviceLine: user.serviceLine, team: { $ne: null } }, // TL team announcements in their SL
      ],
    };
  }

  // TEAM_LEADER or MEMBER
  const orClauses = [];

  // Global (no team scope) announcements from their service line PM or SA
  if (userServiceLine) {
    orClauses.push({ team: null, serviceLine: user.serviceLine });
  }
  // SA-level global (no scope at all)
  orClauses.push({ team: null, serviceLine: null });

  // Team-scoped announcements for their own team
  if (userTeam) {
    orClauses.push({ team: user.team });
  }

  return { $or: orClauses };
};

export const listAnnouncements = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 10));
  const skip = (page - 1) * limit;

  const visibilityFilter = buildVisibilityFilter(req.user);

  const [announcements, total, unreadCount] = await Promise.all([
    Announcement.find(visibilityFilter)
      .populate("author", "name role profileImage")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Announcement.countDocuments(visibilityFilter),
    Announcement.countDocuments({
      ...visibilityFilter,
      readBy: { $nin: [req.user._id] },
    }),
  ]);

  res.status(200).json({
    data: announcements.map((item) => toAnnouncementPayload(item, req.user._id)),
    meta: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
    unreadCount,
  });
});

export const createAnnouncement = asyncHandler(async (req, res) => {
  const { title, description } = req.validated.body;

  // TEAM_LEADER announcements are scoped to their team + serviceLine
  const isTeamLeader = req.user.role === ROLES.TEAM_LEADER;
  const announcementData = {
    title,
    description,
    author: req.user._id,
    team: isTeamLeader ? (req.user.team || null) : null,
    serviceLine: isTeamLeader ? (req.user.serviceLine || null) : null,
  };

  const announcement = await Announcement.create(announcementData);
  await announcement.populate("author", "name role profileImage");

  res.status(201).json({
    data: toAnnouncementPayload(announcement, req.user._id),
  });
});

export const updateAnnouncement = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { title, description } = req.validated.body;

  const announcement = await Announcement.findById(id).populate(
    "author",
    "name role profileImage"
  );
  if (!announcement) {
    return res.status(404).json({ message: "Announcement not found" });
  }

  // TEAM_LEADER can only edit their own announcements
  if (req.user.role === ROLES.TEAM_LEADER) {
    if (String(announcement.author?._id || announcement.author) !== String(req.user._id)) {
      return res.status(403).json({ message: "You can only edit your own announcements" });
    }
  }

  if (typeof title !== "undefined") announcement.title = title;
  if (typeof description !== "undefined") announcement.description = description;

  await announcement.save();

  res.status(200).json({
    data: toAnnouncementPayload(announcement, req.user._id),
  });
});

export const deleteAnnouncement = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const announcement = await Announcement.findById(id);
  if (!announcement) {
    return res.status(404).json({ message: "Announcement not found" });
  }

  // TEAM_LEADER can only delete their own announcements
  if (req.user.role === ROLES.TEAM_LEADER) {
    if (String(announcement.author) !== String(req.user._id)) {
      return res.status(403).json({ message: "You can only delete your own announcements" });
    }
  }

  await announcement.deleteOne();
  res.status(200).json({ message: "Announcement deleted" });
});

export const markAnnouncementRead = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const announcement = await Announcement.findByIdAndUpdate(
    id,
    { $addToSet: { readBy: req.user._id } },
    { new: true }
  ).populate("author", "name role profileImage");

  if (!announcement) {
    return res.status(404).json({ message: "Announcement not found" });
  }

  res.status(200).json({
    data: toAnnouncementPayload(announcement, req.user._id),
  });
});

export const markAllAnnouncementsRead = asyncHandler(async (req, res) => {
  const visibilityFilter = buildVisibilityFilter(req.user);
  await Announcement.updateMany(
    { ...visibilityFilter, readBy: { $nin: [req.user._id] } },
    { $addToSet: { readBy: req.user._id } }
  );

  res.status(200).json({ message: "All announcements marked as read" });
});
