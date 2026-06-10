import asyncHandler from "../utils/asyncHandler.js";
import User from "../models/User.js";
import Team from "../models/Team.js";
import ServiceLine from "../models/ServiceLine.js";
import { APPROVAL_STATUS, EMPLOYEE_STATUS, ROLES } from "../config/constants.js";

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const ensureTeamMatchesServiceLine = async (teamId, serviceLineId) => {
  const team = await Team.findById(teamId);
  if (!team) {
    const error = new Error("Team not found");
    error.statusCode = 404;
    throw error;
  }
  if (serviceLineId && String(team.serviceLine) !== String(serviceLineId)) {
    const error = new Error("Team does not belong to the service line");
    error.statusCode = 400;
    throw error;
  }
  return team;
};

const ensureSingleProjectManager = async (serviceLineId, userId) => {
  const filter = {
    role: ROLES.PROJECT_MANAGER,
    serviceLine: serviceLineId,
  };
  if (userId) {
    filter._id = { $ne: userId };
  }
  const existing = await User.findOne(filter);
  if (existing) {
    const error = new Error("Project Manager already assigned for this service line");
    error.statusCode = 409;
    throw error;
  }
};

export const listUsers = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.user.role === ROLES.PROJECT_MANAGER) {
    filter.serviceLine = req.user.serviceLine;
  }
  if (req.user.role === ROLES.TEAM_LEADER) {
    filter.team = req.user.team;
  }
  if (req.user.role === ROLES.MEMBER) {
    filter.serviceLine = req.user.serviceLine;
  }

  const search = String(req.query.search || "").trim();
  if (search) {
    const pattern = new RegExp(escapeRegExp(search), "i");
    filter.$or = [{ name: pattern }, { employeeId: pattern }];
  }

  const fetchAll = String(req.query.all || "").toLowerCase() === "true";

  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 10));
  const skip = fetchAll ? 0 : (page - 1) * limit;

  const [users, total, approvedCount, pendingCount] = await Promise.all([
    User.find(filter)
      .select("-password")
      .populate("serviceLine team")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(fetchAll ? 0 : limit),
    User.countDocuments(filter),
    User.countDocuments({ ...filter, approvalStatus: APPROVAL_STATUS.APPROVED }),
    User.countDocuments({ ...filter, approvalStatus: APPROVAL_STATUS.PENDING }),
  ]);

  res.status(200).json({
    data: users,
    meta: {
      page: fetchAll ? 1 : page,
      limit: fetchAll ? total : limit,
      total,
      totalPages: fetchAll ? 1 : Math.max(1, Math.ceil(total / limit)),
      approvedCount,
      pendingCount,
    },
  });
});

export const approveUser = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { approvalStatus } = req.validated.body;

  const user = await User.findById(id);
  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  if (req.user.role === ROLES.PROJECT_MANAGER) {
    if (!req.user.serviceLine || String(user.serviceLine) !== String(req.user.serviceLine)) {
      return res.status(403).json({ message: "Forbidden" });
    }
  }
  if (req.user.role === ROLES.TEAM_LEADER) {
    if (!req.user.team || String(user.team) !== String(req.user.team)) {
      return res.status(403).json({ message: "Forbidden" });
    }
  }

  user.approvalStatus = approvalStatus;
  user.approvedBy = req.user._id;
  user.approvedAt = new Date();
  await user.save();

  res.status(200).json({ message: "Approval updated", user });
});

export const assignUser = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { role } = req.validated.body;
  const normalizedServiceLine =
    typeof req.validated.body.serviceLine === "string" &&
      req.validated.body.serviceLine.trim() === ""
      ? undefined
      : req.validated.body.serviceLine;
  const normalizedTeam =
    typeof req.validated.body.team === "string" && req.validated.body.team.trim() === ""
      ? undefined
      : req.validated.body.team;
  const roleProvided = typeof role !== "undefined";
  const serviceLineProvided = typeof normalizedServiceLine !== "undefined";
  const teamProvided = typeof normalizedTeam !== "undefined";

  const user = await User.findById(id);
  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  if (roleProvided && String(req.user._id) === String(user._id) && role !== user.role) {
    return res.status(403).json({ message: "You cannot change your own role" });
  }

  if (req.user.role === ROLES.PROJECT_MANAGER) {
    if (role && ![ROLES.TEAM_LEADER, ROLES.MEMBER].includes(role)) {
      return res.status(403).json({ message: "Forbidden" });
    }
    if (!req.user.serviceLine) {
      return res.status(400).json({ message: "Project Manager service line missing" });
    }
    if (user.serviceLine && String(user.serviceLine) !== String(req.user.serviceLine)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const nextRole = roleProvided ? role : user.role;
    const nextTeamId = teamProvided ? normalizedTeam : user.team;
    if (nextRole === ROLES.TEAM_LEADER && !nextTeamId) {
      return res.status(400).json({ message: "Team is required for Team Leader" });
    }
    if (nextTeamId) {
      await ensureTeamMatchesServiceLine(nextTeamId, req.user.serviceLine);
    }

    user.serviceLine = req.user.serviceLine;
    if (teamProvided) {
      user.team = normalizedTeam;
    }
    if (role) {
      user.role = role;
    }
    await user.save();
    return res.status(200).json({ message: "User updated", user });
  }

  const nextRole = roleProvided ? role : user.role;
  const nextServiceLine = serviceLineProvided ? normalizedServiceLine : user.serviceLine;
  const nextTeamId = teamProvided ? normalizedTeam : user.team;

  if (nextRole === ROLES.PROJECT_MANAGER) {
    if (!nextServiceLine) {
      return res.status(400).json({ message: "Service line is required for Project Manager" });
    }
    const serviceLineExists = await ServiceLine.exists({ _id: nextServiceLine });
    if (!serviceLineExists) {
      return res.status(404).json({ message: "Service line not found" });
    }
    await ensureSingleProjectManager(nextServiceLine, user._id);
  }

  if (nextRole === ROLES.TEAM_LEADER && !nextTeamId) {
    return res.status(400).json({ message: "Team is required for Team Leader" });
  }

  if (nextTeamId) {
    const teamDoc = await ensureTeamMatchesServiceLine(nextTeamId, nextServiceLine);
    if (!serviceLineProvided && !user.serviceLine) {
      user.serviceLine = teamDoc.serviceLine;
    }
  }

  if (roleProvided) {
    user.role = role;
  }
  if (serviceLineProvided) {
    user.serviceLine = normalizedServiceLine;
  }
  if (teamProvided) {
    user.team = normalizedTeam;
  }

  if (nextRole === ROLES.PROJECT_MANAGER) {
    user.team = undefined;
  }

  await user.save();
  res.status(200).json({ message: "User updated", user });
});

export const updateUserTarget = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { monthlyTarget } = req.validated.body;

  const user = await User.findById(id);
  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  if (req.user.role === ROLES.PROJECT_MANAGER) {
    if (!req.user.serviceLine || String(user.serviceLine) !== String(req.user.serviceLine)) {
      return res.status(403).json({ message: "Forbidden" });
    }
  }
  if (req.user.role === ROLES.TEAM_LEADER) {
    if (!req.user.team || String(user.team) !== String(req.user.team)) {
      return res.status(403).json({ message: "Forbidden" });
    }
  }

  user.monthlyTarget = monthlyTarget;
  await user.save();

  res.status(200).json({ message: "Target updated", user });
});

export const updateUserAdmin = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const updates = req.body || {};
  const normalizedServiceLine =
    typeof updates.serviceLine === "string" && updates.serviceLine.trim() === ""
      ? undefined
      : updates.serviceLine;
  const normalizedTeam =
    typeof updates.team === "string" && updates.team.trim() === ""
      ? undefined
      : updates.team;

  const user = await User.findById(id);
  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  if (updates.email && updates.email !== user.email) {
    const exists = await User.exists({ email: updates.email, _id: { $ne: id } });
    if (exists) {
      return res.status(409).json({ message: "Email already in use" });
    }
  }
  if (updates.employeeId && updates.employeeId !== user.employeeId) {
    const exists = await User.exists({ employeeId: updates.employeeId, _id: { $ne: id } });
    if (exists) {
      return res.status(409).json({ message: "Employee ID already in use" });
    }
  }

  const nextRole = typeof updates.role !== "undefined" ? updates.role : user.role;
  const nextServiceLine = typeof normalizedServiceLine !== "undefined" ? normalizedServiceLine : user.serviceLine;
  const nextTeamId = typeof normalizedTeam !== "undefined" ? normalizedTeam : user.team;

  if (nextRole === ROLES.PROJECT_MANAGER) {
    if (!nextServiceLine) {
      return res.status(400).json({ message: "Service line is required for Project Manager" });
    }
    const serviceLineExists = await ServiceLine.exists({ _id: nextServiceLine });
    if (!serviceLineExists) {
      return res.status(404).json({ message: "Service line not found" });
    }
    await ensureSingleProjectManager(nextServiceLine, user._id);
  }

  if (nextRole === ROLES.TEAM_LEADER && !nextTeamId) {
    return res.status(400).json({ message: "Team is required for Team Leader" });
  }

  if (nextTeamId) {
    const teamDoc = await ensureTeamMatchesServiceLine(nextTeamId, nextServiceLine);
    if (!nextServiceLine && !user.serviceLine) {
      user.serviceLine = teamDoc.serviceLine;
    }
  }

  if (typeof updates.name !== "undefined") user.name = updates.name;
  if (typeof updates.email !== "undefined") user.email = updates.email;
  if (typeof updates.employeeId !== "undefined") user.employeeId = updates.employeeId;
  if (typeof updates.phone !== "undefined") user.phone = updates.phone;
  if (typeof updates.officeEmail !== "undefined") user.officeEmail = updates.officeEmail;
  if (typeof updates.profileImage !== "undefined") user.profileImage = updates.profileImage;
  if (typeof updates.dateOfBirth !== "undefined") user.dateOfBirth = updates.dateOfBirth;
  if (typeof updates.presentAddress !== "undefined") user.presentAddress = updates.presentAddress;
  if (typeof updates.permanentAddress !== "undefined") user.permanentAddress = updates.permanentAddress;
  if (typeof updates.joinDate !== "undefined") user.joinDate = updates.joinDate;
  if (typeof updates.monthlyTarget !== "undefined") user.monthlyTarget = updates.monthlyTarget;
  if (typeof updates.status !== "undefined") user.status = updates.status;
  if (typeof updates.emailVerified !== "undefined") user.emailVerified = updates.emailVerified;

  if (typeof updates.role !== "undefined") user.role = updates.role;
  if (typeof normalizedServiceLine !== "undefined") user.serviceLine = normalizedServiceLine;
  if (typeof normalizedTeam !== "undefined") user.team = normalizedTeam;

  if (nextRole === ROLES.PROJECT_MANAGER) {
    user.team = undefined;
  }

  if (typeof updates.approvalStatus !== "undefined") {
    user.approvalStatus = updates.approvalStatus;
    if (updates.approvalStatus === APPROVAL_STATUS.APPROVED) {
      user.approvedBy = req.user._id;
      user.approvedAt = new Date();
    } else {
      user.approvedBy = undefined;
      user.approvedAt = undefined;
    }
  }

  if (updates.password) {
    user.password = updates.password;
  }

  await user.save();
  const updated = await User.findById(id).select("-password").populate("serviceLine team");
  res.status(200).json({ message: "User updated", user: updated });
});

export const createProjectManager = asyncHandler(async (req, res) => {
  const { name, email, employeeId, password, serviceLine } = req.validated.body;

  if (!serviceLine) {
    return res.status(400).json({ message: "Service line is required" });
  }

  const serviceLineExists = await ServiceLine.exists({ _id: serviceLine });
  if (!serviceLineExists) {
    return res.status(404).json({ message: "Service line not found" });
  }

  await ensureSingleProjectManager(serviceLine);

  const existing = await User.findOne({ $or: [{ email }, { employeeId }] });
  if (existing) {
    return res.status(409).json({ message: "User already exists" });
  }

  const user = await User.create({
    name,
    email,
    employeeId,
    password,
    serviceLine,
    role: ROLES.PROJECT_MANAGER,
    emailVerified: true,
    approvalStatus: APPROVAL_STATUS.APPROVED,
    approvedBy: req.user._id,
    approvedAt: new Date(),
  });

  res.status(201).json({ message: "Project Manager created", user });
});

export const getMyProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id)
    .select("-password")
    .populate("serviceLine team");
  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }
  res.status(200).json({ user });
});

export const updateMyProfile = asyncHandler(async (req, res) => {
  const updates = req.validated.body;
  const user = await User.findByIdAndUpdate(req.user._id, updates, {
    new: true,
  })
    .select("-password")
    .populate("serviceLine team");

  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  res.status(200).json({ message: "Profile updated", user });
});

export const updateUserStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status } = req.validated.body;

  const user = await User.findById(id);
  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  if (req.user.role === ROLES.PROJECT_MANAGER) {
    if (!req.user.serviceLine || String(user.serviceLine) !== String(req.user.serviceLine)) {
      return res.status(403).json({ message: "Forbidden" });
    }
  }
  if (req.user.role === ROLES.TEAM_LEADER) {
    if (!req.user.team || String(user.team) !== String(req.user.team)) {
      return res.status(403).json({ message: "Forbidden" });
    }
  }

  user.status = status;
  await user.save();

  res.status(200).json({ message: "Status updated", user });
});

export const deleteUser = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if ([ROLES.PROJECT_MANAGER, ROLES.TEAM_LEADER].includes(req.user.role)) {
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    if (
      req.user.role === ROLES.PROJECT_MANAGER &&
      (!req.user.serviceLine || String(user.serviceLine) !== String(req.user.serviceLine))
    ) {
      return res.status(403).json({ message: "Forbidden" });
    }
    if (
      req.user.role === ROLES.TEAM_LEADER &&
      (!req.user.team || String(user.team) !== String(req.user.team))
    ) {
      return res.status(403).json({ message: "Forbidden" });
    }
  }
  const user = await User.findByIdAndDelete(id);
  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }
  res.status(200).json({ message: "User deleted" });
});
