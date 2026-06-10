import asyncHandler from "../utils/asyncHandler.js";
import Team from "../models/Team.js";
import { ROLES } from "../config/constants.js";

export const listTeams = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.serviceLine) {
    filter.serviceLine = req.query.serviceLine;
  }
  if (req.user?.role === ROLES.PROJECT_MANAGER) {
    filter.serviceLine = req.user.serviceLine;
  }
  if (req.user?.role === ROLES.TEAM_LEADER) {
    filter.serviceLine = req.user.serviceLine;
  }
  const items = await Team.find(filter).populate("serviceLine").sort({ createdAt: -1 });
  res.status(200).json(items);
});

export const listTeamSummary = asyncHandler(async (req, res) => {
  const matchStage = [];
  if (req.user?.role === ROLES.PROJECT_MANAGER) {
    matchStage.push({ $match: { serviceLine: req.user.serviceLine } });
  }
  const summary = await Team.aggregate([
    ...matchStage,
    {
      $lookup: {
        from: "servicelines",
        localField: "serviceLine",
        foreignField: "_id",
        as: "serviceLine",
      },
    },
    { $unwind: "$serviceLine" },
    {
      $lookup: {
        from: "users",
        let: { teamId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$team", "$$teamId"] },
                  { $eq: ["$role", ROLES.MEMBER] },
                ],
              },
            },
          },
        ],
        as: "members",
      },
    },
    {
      $lookup: {
        from: "teams",
        let: { serviceLineId: "$serviceLine._id" },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ["$serviceLine", "$$serviceLineId"] },
            },
          },
        ],
        as: "serviceTeams",
      },
    },
    {
      $addFields: {
        memberCount: { $size: "$members" },
        serviceLineTeamCount: { $size: "$serviceTeams" },
      },
    },
    {
      $project: {
        members: 0,
        serviceTeams: 0,
      },
    },
    { $sort: { createdAt: -1 } },
  ]);

  res.status(200).json(summary);
});

export const createTeam = asyncHandler(async (req, res) => {
  const { name, serviceLine } = req.validated.body;
  const serviceLineId =
    req.user?.role === ROLES.PROJECT_MANAGER ? req.user.serviceLine : serviceLine;
  if (!serviceLineId) {
    return res.status(400).json({ message: "Service line is required" });
  }
  const team = await Team.create({
    name,
    serviceLine: serviceLineId,
    createdBy: req.user._id,
  });
  res.status(201).json(team);
});

export const updateTeam = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, status, teamTarget } = req.validated.body;
  if (req.user?.role === ROLES.PROJECT_MANAGER) {
    const existing = await Team.findById(id).select("serviceLine");
    if (!existing) {
      return res.status(404).json({ message: "Team not found" });
    }
    if (String(existing.serviceLine) !== String(req.user.serviceLine)) {
      return res.status(403).json({ message: "Forbidden" });
    }
  }
  const team = await Team.findByIdAndUpdate(
    id,
    { name, status, teamTarget },
    { new: true }
  ).populate("serviceLine");
  if (!team) {
    return res.status(404).json({ message: "Team not found" });
  }
  res.status(200).json(team);
});

export const deleteTeam = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (req.user?.role === ROLES.PROJECT_MANAGER) {
    const existing = await Team.findById(id).select("serviceLine");
    if (!existing) {
      return res.status(404).json({ message: "Team not found" });
    }
    if (String(existing.serviceLine) !== String(req.user.serviceLine)) {
      return res.status(403).json({ message: "Forbidden" });
    }
  }
  const team = await Team.findByIdAndDelete(id);
  if (!team) {
    return res.status(404).json({ message: "Team not found" });
  }
  res.status(200).json({ message: "Team deleted" });
});
