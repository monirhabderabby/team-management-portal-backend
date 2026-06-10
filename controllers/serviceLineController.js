import asyncHandler from "../utils/asyncHandler.js";
import ServiceLine from "../models/ServiceLine.js";
import { ROLES } from "../config/constants.js";

export const listServiceLines = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.user?.role === ROLES.PROJECT_MANAGER || req.user?.role === ROLES.TEAM_LEADER) {
    if (req.user?.serviceLine) {
      filter._id = req.user.serviceLine;
    } else {
      return res.status(200).json([]);
    }
  }
  const items = await ServiceLine.find(filter).sort({ createdAt: -1 });
  res.status(200).json(items);
});

export const listServiceLineSummary = asyncHandler(async (req, res) => {
  const summary = await ServiceLine.aggregate([
    {
      $lookup: {
        from: "teams",
        localField: "_id",
        foreignField: "serviceLine",
        as: "teams",
      },
    },
    {
      $lookup: {
        from: "users",
        let: { serviceLineId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$serviceLine", "$$serviceLineId"] },
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
      $addFields: {
        teamCount: { $size: "$teams" },
        memberCount: { $size: "$members" },
      },
    },
    {
      $project: {
        teams: 0,
        members: 0,
      },
    },
    { $sort: { createdAt: -1 } },
  ]);

  res.status(200).json(summary);
});

export const createServiceLine = asyncHandler(async (req, res) => {
  const { name } = req.validated.body;
  const existing = await ServiceLine.findOne({ name });
  if (existing) {
    return res.status(409).json({ message: "Service line already exists" });
  }
  const serviceLine = await ServiceLine.create({ name, createdBy: req.user._id });
  res.status(201).json(serviceLine);
});

export const updateServiceLine = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, status } = req.validated.body;
  const serviceLine = await ServiceLine.findByIdAndUpdate(
    id,
    { name, status },
    { new: true }
  );
  if (!serviceLine) {
    return res.status(404).json({ message: "Service line not found" });
  }
  res.status(200).json(serviceLine);
});

export const deleteServiceLine = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const serviceLine = await ServiceLine.findByIdAndDelete(id);
  if (!serviceLine) {
    return res.status(404).json({ message: "Service line not found" });
  }
  res.status(200).json({ message: "Service line deleted" });
});
