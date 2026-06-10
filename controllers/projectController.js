import asyncHandler from "../utils/asyncHandler.js";
import Project from "../models/Project.js";
import Team from "../models/Team.js";
import ServiceLine from "../models/ServiceLine.js";
import User from "../models/User.js";
import { ROLES } from "../config/constants.js";

const ensureTeamMatchesServiceLine = async (teamId, serviceLineId) => {
  const team = await Team.findById(teamId);
  if (!team) {
    const error = new Error("The selected team could not be found. Please refresh and try again.");
    error.statusCode = 404;
    throw error;
  }
  if (serviceLineId && String(team.serviceLine) !== String(serviceLineId)) {
    const error = new Error(`The team "${team.name}" does not belong to the selected service line.`);
    error.statusCode = 400;
    throw error;
  }
  return team;
};

const resolveEmployeeNames = async (projects) => {
  if (!projects || projects.length === 0) return projects;

  const isArray = Array.isArray(projects);
  const projectList = isArray ? projects : [projects];

  const employeeIds = [...new Set(projectList.map(p => p.employeeId))].filter(Boolean);
  const users = await User.find({ employeeId: { $in: employeeIds } }).select("name employeeId");

  const userMap = users.reduce((acc, u) => {
    acc[u.employeeId] = u.name;
    return acc;
  }, {});

  const result = projectList.map(p => {
    const obj = p.toObject ? p.toObject() : p;
    obj.employeeName = userMap[p.employeeId] || "Unknown";
    return obj;
  });

  return isArray ? result : result[0];
};

const ensureServiceLine = async (serviceLineId) => {
  const exists = await ServiceLine.exists({ _id: serviceLineId });
  if (!exists) {
    const error = new Error("The selected service line is invalid or has been removed.");
    error.statusCode = 404;
    throw error;
  }
};

const generateProjectId = async () => {
  let projectId = "";
  let exists = true;
  while (exists) {
    const suffix = String(Math.floor(1000 + Math.random() * 9000));
    projectId = `PRJ-${suffix}`;
    exists = await Project.exists({ projectId });
  }
  return projectId;
};

const canManageProject = (user, project) => {
  if (user.role === ROLES.SUPER_ADMIN) return true;
  if (user.role === ROLES.PROJECT_MANAGER) {
    return String(project.serviceLine) === String(user.serviceLine);
  }
  if (user.role === ROLES.TEAM_LEADER) {
    return String(project.team) === String(user.team);
  }
  // Allow the creator OR the assigned employee to manage the project
  return (
    String(project.createdBy) === String(user._id) ||
    String(project.employeeId) === String(user.employeeId)
  );
};

const canDeleteProject = (user, project) => {
  if ([ROLES.SUPER_ADMIN, ROLES.PROJECT_MANAGER, ROLES.TEAM_LEADER].includes(user.role)) {
    return canManageProject(user, project);
  }
  return false;
};

const canViewProject = (user, project) => {
  if (user.role === ROLES.SUPER_ADMIN) return true;
  if (user.role === ROLES.PROJECT_MANAGER) {
    return String(project.serviceLine) === String(user.serviceLine);
  }
  if (user.role === ROLES.TEAM_LEADER) {
    return String(project.team) === String(user.team);
  }
  if (String(project.createdBy) === String(user._id)) return true;
  return String(project.serviceLine) === String(user.serviceLine);
};

const buildListFilter = (req) => {
  const filter = {};
  if (req.user.role === ROLES.PROJECT_MANAGER) {
    filter.serviceLine = req.user.serviceLine;
    if (req.query.team) {
      filter.team = req.query.team;
    }
  } else if (req.user.role === ROLES.TEAM_LEADER) {
    filter.serviceLine = req.user.serviceLine;
    if (req.query.team) {
      filter.team = req.query.team;
    }
  } else if (req.user.role === ROLES.MEMBER) {
    if (req.query.scope === "service-line") {
      filter.serviceLine = req.user.serviceLine;
      if (req.query.team && req.query.team !== "all_teams") {
        filter.team = req.query.team;
      }
    } else {
      filter.$or = [
        { employeeId: req.user.employeeId },
        { createdBy: req.user._id }
      ];
    }
  } else if (req.user.role === ROLES.SUPER_ADMIN) {
    if (req.query.scope === "own") {
      filter.createdBy = req.user._id;
    }
    if (req.query.team) {
      filter.team = req.query.team;
    }
  }

  if (req.query.serviceLine) {
    if (req.user.role === ROLES.SUPER_ADMIN) {
      filter.serviceLine = req.query.serviceLine;
    } else if (String(req.query.serviceLine) === String(req.user.serviceLine)) {
      filter.serviceLine = req.query.serviceLine;
    }
  }
  if (req.query.status) {
    const raw = req.query.status;
    const statusList = Array.isArray(raw)
      ? raw
      : String(raw)
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
    if (statusList.length > 0) {
      filter.status = { $in: statusList };
    }
  }
  if (req.query.orderId) {
    filter.orderId = { $regex: req.query.orderId, $options: "i" };
  }
  if (req.query.employeeId) {
    filter.employeeId = String(req.query.employeeId).trim();
  }
  if (req.query.month && req.query.month !== "all") {
    const [yearStr, monthStr] = String(req.query.month).split("-");
    const year = Number.parseInt(yearStr, 10);
    const month = Number.parseInt(monthStr, 10);
    if (!Number.isNaN(year) && !Number.isNaN(month) && month >= 1 && month <= 12) {
      const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
      const end = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
      filter.nextWipDeadline = { $gte: start, $lt: end };
    }
  }
  return filter;
};

const buildMetricsFilter = (req) => {
  const orFilters = [];
  if (req.user.employeeId) {
    orFilters.push({ employeeId: req.user.employeeId });
  }
  if (req.user._id) {
    orFilters.push({ createdBy: req.user._id });
  }
  const filter = orFilters.length > 0 ? { $or: orFilters } : {};

  if (req.query.month && req.query.month !== "all") {
    const [yearStr, monthStr] = String(req.query.month).split("-");
    const year = Number.parseInt(yearStr, 10);
    const month = Number.parseInt(monthStr, 10);
    if (
      Number.isNaN(year) ||
      Number.isNaN(month) ||
      month < 1 ||
      month > 12
    ) {
      const error = new Error("Invalid month format. Use YYYY-MM or all.");
      error.statusCode = 400;
      throw error;
    }
    const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
    const end = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
    filter.nextWipDeadline = { $gte: start, $lt: end };
  }

  return filter;
};

const buildScopedMetricsFilter = (req) => {
  const filter = {};
  const monthParam = String(req.query.month || "").trim();

  if (monthParam && monthParam !== "all") {
    const [yearStr, monthStr] = monthParam.split("-");
    const year = Number.parseInt(yearStr, 10);
    const month = Number.parseInt(monthStr, 10);
    if (
      Number.isNaN(year) ||
      Number.isNaN(month) ||
      month < 1 ||
      month > 12
    ) {
      const error = new Error("Invalid month format. Use YYYY-MM or all.");
      error.statusCode = 400;
      throw error;
    }
    const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
    const end = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
    filter.nextWipDeadline = { $gte: start, $lt: end };
  }

  if (req.user.role === ROLES.PROJECT_MANAGER) {
    if (!req.user.serviceLine) {
      const error = new Error("Project Manager service line missing");
      error.statusCode = 400;
      throw error;
    }
    filter.serviceLine = req.user.serviceLine;
    if (req.query.team) {
      filter.team = req.query.team;
    }
    return filter;
  }

  if (req.user.role === ROLES.TEAM_LEADER) {
    if (!req.user.team) {
      const error = new Error("Team Leader team missing");
      error.statusCode = 400;
      throw error;
    }
    filter.team = req.user.team;
    return filter;
  }

  if (req.user.role === ROLES.SUPER_ADMIN) {
    if (req.query.scope === "service-line" && req.query.serviceLine) {
      filter.serviceLine = req.query.serviceLine;
    }
    if (req.query.scope === "team" && req.query.team) {
      filter.team = req.query.team;
    }
    return filter;
  }

  const error = new Error("Forbidden");
  error.statusCode = 403;
  throw error;
};

export const listProjects = asyncHandler(async (req, res) => {
  if (req.user.role === ROLES.TEAM_LEADER && req.query.team) {
    const team = await Team.findById(req.query.team).select("serviceLine");
    if (!team || String(team.serviceLine) !== String(req.user.serviceLine)) {
      return res.status(403).json({ message: "You can only filter teams within your own service line." });
    }
  }
  if (
    req.user.role === ROLES.MEMBER &&
    req.query.scope === "service-line" &&
    req.query.team &&
    req.query.team !== "all_teams"
  ) {
    const team = await Team.findById(req.query.team).select("serviceLine");
    if (!team || String(team.serviceLine) !== String(req.user.serviceLine)) {
      return res.status(403).json({ message: "You can only filter teams within your own service line." });
    }
  }
  const filter = buildListFilter(req);
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 10));
  const skip = (page - 1) * limit;

  const projects = await Project.find(filter)
    .populate([
      { path: "serviceLine team createdBy", select: "name email employeeId role" },
      { path: "remarks.createdBy", select: "name employeeId" },
    ])
    .sort({ createdAt: -1 });

  const projectsWithNames = await resolveEmployeeNames(projects);
  const now = Date.now();
  const sortedProjects = [...projectsWithNames].sort((a, b) => {
    const aTime = new Date(a.deadline).getTime();
    const bTime = new Date(b.deadline).getTime();
    const aRemaining = Number.isNaN(aTime) ? Number.POSITIVE_INFINITY : aTime - now;
    const bRemaining = Number.isNaN(bTime) ? Number.POSITIVE_INFINITY : bTime - now;
    const aOverdue = aRemaining <= 0;
    const bOverdue = bRemaining <= 0;
    if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
    if (aOverdue && bOverdue) return bRemaining - aRemaining;
    return aRemaining - bRemaining;
  });
  const total = sortedProjects.length;
  const start = (page - 1) * limit;
  const pagedProjects = sortedProjects.slice(start, start + limit);
  res.status(200).json({
    data: pagedProjects,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  });
});

export const listProjectMetrics = asyncHandler(async (req, res) => {
  const filter = buildMetricsFilter(req);

  const [grouped, nearest] = await Promise.all([
    Project.aggregate([
      { $match: filter },
      {
        $group: {
          _id: "$status",
          amount: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
    ]),
    Project.find({
      ...filter,
      status: { $nin: ["Delivered", "Cancelled"] },
      nextWipDeadline: { $ne: null },
    })
      .sort({ nextWipDeadline: 1 })
      .limit(1)
      .select("nextWipDeadline"),
  ]);

  const summary = {
    deliveredAmount: 0,
    deliveredCount: 0,
    wipAmount: 0,
    wipCount: 0,
    cancelAmount: 0,
    cancelCount: 0,
    revisionAmount: 0,
    revisionCount: 0,
    nearestNextWip: nearest[0]?.nextWipDeadline || null,
  };

  grouped.forEach((row) => {
    if (row._id === "Delivered") {
      summary.deliveredAmount = row.amount || 0;
      summary.deliveredCount = row.count || 0;
    } else if (row._id === "WIP") {
      summary.wipAmount = row.amount || 0;
      summary.wipCount = row.count || 0;
    } else if (row._id === "Cancelled") {
      summary.cancelAmount = row.amount || 0;
      summary.cancelCount = row.count || 0;
    } else if (row._id === "Revision") {
      summary.revisionAmount = row.amount || 0;
      summary.revisionCount = row.count || 0;
    }
  });

  res.status(200).json({ data: summary });
});

export const listScopedProjectMetrics = asyncHandler(async (req, res) => {
  const filter = buildScopedMetricsFilter(req);

  const grouped = await Project.aggregate([
    { $match: filter },
    {
      $group: {
        _id: "$status",
        amount: { $sum: "$amount" },
        count: { $sum: 1 },
      },
    },
  ]);

  const summary = {
    deliveredAmount: 0,
    deliveredCount: 0,
    wipAmount: 0,
    wipCount: 0,
    cancelAmount: 0,
    cancelCount: 0,
    revisionAmount: 0,
    revisionCount: 0,
  };

  grouped.forEach((row) => {
    if (row._id === "Delivered") {
      summary.deliveredAmount = row.amount || 0;
      summary.deliveredCount = row.count || 0;
    } else if (row._id === "WIP") {
      summary.wipAmount = row.amount || 0;
      summary.wipCount = row.count || 0;
    } else if (row._id === "Cancelled") {
      summary.cancelAmount = row.amount || 0;
      summary.cancelCount = row.count || 0;
    } else if (row._id === "Revision") {
      summary.revisionAmount = row.amount || 0;
      summary.revisionCount = row.count || 0;
    }
  });

  res.status(200).json({ data: summary });
});

export const listProjectWipOverview = asyncHandler(async (req, res) => {
  const baseFilter = {
    status: { $nin: ["Delivered", "Cancelled"] },
    nextWipDeadline: { $ne: null },
  };

  if (req.user.role === ROLES.PROJECT_MANAGER) {
    baseFilter.serviceLine = req.user.serviceLine;
  } else if (req.user.role === ROLES.TEAM_LEADER) {
    baseFilter.serviceLine = req.user.serviceLine;
  } else if (req.user.role === ROLES.MEMBER) {
    baseFilter.employeeId = req.user.employeeId;
  }

  const now = new Date();
  const next24 = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const next48 = new Date(now.getTime() + 48 * 60 * 60 * 1000);

  const [overdueCount, upcoming24Count, upcoming48Count, nearestUpcoming] =
    await Promise.all([
      Project.countDocuments({
        ...baseFilter,
        nextWipDeadline: { $lt: now },
      }),
      Project.countDocuments({
        ...baseFilter,
        nextWipDeadline: { $gte: now, $lt: next24 },
      }),
      Project.countDocuments({
        ...baseFilter,
        nextWipDeadline: { $gte: next24, $lt: next48 },
      }),
      Project.findOne({
        ...baseFilter,
        nextWipDeadline: { $gte: now },
      })
        .select("projectId profileName clientName orderId nextWipDeadline team serviceLine")
        .populate([
          { path: "team", select: "name" },
          { path: "serviceLine", select: "name" },
        ])
        .sort({ nextWipDeadline: 1 })
        .lean(),
    ]);

  res.status(200).json({
    data: {
      overdueCount,
      upcoming24Count,
      upcoming48Count,
      nearestUpcoming: nearestUpcoming || null,
    },
  });
});

export const listProjectTimeline = asyncHandler(async (req, res) => {
  const filter = {
    status: { $nin: ["Delivered", "Cancelled"] },
  };

  if (req.user.role === ROLES.PROJECT_MANAGER) {
    filter.serviceLine = req.user.serviceLine;
  } else if (req.user.role === ROLES.TEAM_LEADER) {
    filter.serviceLine = req.user.serviceLine;
  } else if (req.user.role === ROLES.MEMBER) {
    filter.employeeId = req.user.employeeId;
  }

  const projects = await Project.find(filter)
    .populate([
      { path: "serviceLine team createdBy", select: "name email employeeId role" },
      { path: "remarks.createdBy", select: "name employeeId" },
    ])
    .sort({ nextWipDeadline: 1 });

  const projectsWithNames = await resolveEmployeeNames(projects);
  res.status(200).json({ data: projectsWithNames });
});

export const createProject = asyncHandler(async (req, res) => {
  const {
    clientName,
    profileName,
    orderId,
    employeeId,
    serviceLine,
    team,
    amount,
    startDate,
    deadline,
    nextWipDeadline,
    deliveryDate,
    status,
    remarks,
    instructionSheet,
    clientRating,
  } = req.validated.body;

  let serviceLineId = req.user.serviceLine;
  let teamId = req.user.team;
  let employeeIdValue = req.user.employeeId;

  if (req.user.role === ROLES.SUPER_ADMIN) {
    serviceLineId = serviceLine || req.user.serviceLine;
    teamId = team || req.user.team;
    employeeIdValue = employeeId || req.user.employeeId;
  }

  if (req.user.role === ROLES.PROJECT_MANAGER && team) {
    teamId = team;
  }

  if ([ROLES.PROJECT_MANAGER, ROLES.TEAM_LEADER].includes(req.user.role) && employeeId) {
    const targetUser = await User.findOne({ employeeId }).select("serviceLine team");
    if (!targetUser) {
      return res.status(404).json({ message: "Employee not found" });
    }
    if (
      req.user.role === ROLES.PROJECT_MANAGER &&
      String(targetUser.serviceLine) !== String(req.user.serviceLine)
    ) {
      return res.status(403).json({ message: "You can only assign projects to employees within your own service line." });
    }
    if (
      req.user.role === ROLES.TEAM_LEADER &&
      String(targetUser.team) !== String(req.user.team)
    ) {
      return res.status(403).json({ message: "You can only assign projects to employees within your own team." });
    }
    employeeIdValue = employeeId;
    if (!teamId && targetUser.team) {
      teamId = targetUser.team;
    }
    if (!serviceLineId && targetUser.serviceLine) {
      serviceLineId = targetUser.serviceLine;
    }
  }

  if (!serviceLineId) {
    return res.status(400).json({ message: "Service line is required" });
  }
  if (!teamId) {
    return res.status(400).json({ message: "Team is required" });
  }

  await ensureServiceLine(serviceLineId);
  await ensureTeamMatchesServiceLine(teamId, serviceLineId);

  const projectId = await generateProjectId();
  const project = await Project.create({
    projectId,
    clientName,
    profileName,
    orderId,
    employeeId: employeeIdValue,
    serviceLine: serviceLineId,
    team: teamId,
    amount,
    startDate,
    deadline,
    nextWipDeadline,
    deliveryDate,
    status,
    instructionSheet,
    clientRating,
    remarks: remarks ? [{ text: remarks, createdBy: req.user._id }] : [],
    createdBy: req.user._id,
  });

  const populated = await Project.findById(project._id).populate([
    { path: "serviceLine team createdBy", select: "name email employeeId role" },
    { path: "remarks.createdBy", select: "name employeeId" },
  ]);

  const finalProject = await resolveEmployeeNames(populated);
  res.status(201).json({ message: "Project created", project: finalProject });
});

export const updateProject = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const updates = req.validated.body;

  const project = await Project.findById(id);
  if (!project) {
    return res.status(404).json({ message: "Project not found" });
  }

  if (!canManageProject(req.user, project)) {
    return res.status(403).json({ message: "You do not have permission to modify this project." });
  }

  if (req.user.role !== ROLES.SUPER_ADMIN) {
    const forbiddenFields = ["serviceLine", "team", "employeeId", "projectId", "createdBy"];
    for (const key of forbiddenFields) {
      if (typeof updates[key] !== "undefined") {
        return res.status(403).json({ message: "Forbidden" });
      }
    }
  }

  if (updates.serviceLine || updates.team) {
    const serviceLineId = updates.serviceLine || project.serviceLine;
    const teamId = updates.team || project.team;
    await ensureServiceLine(serviceLineId);
    await ensureTeamMatchesServiceLine(teamId, serviceLineId);
  }

  Object.entries(updates).forEach(([key, value]) => {
    project[key] = value;
  });

  await project.save();

  const populated = await Project.findById(project._id).populate([
    { path: "serviceLine team createdBy", select: "name email employeeId role" },
    { path: "remarks.createdBy", select: "name employeeId" },
  ]);

  const finalProject = await resolveEmployeeNames(populated);
  res.status(200).json({ message: "Project updated", project: finalProject });
});

export const deleteProject = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const project = await Project.findById(id);
  if (!project) {
    return res.status(404).json({ message: "Project not found" });
  }

  if (!canDeleteProject(req.user, project)) {
    return res.status(403).json({ message: "Forbidden" });
  }

  await project.deleteOne();
  res.status(200).json({ message: "Project deleted" });
});

export const addProjectRemark = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { text } = req.validated.body;

  const project = await Project.findById(id);
  if (!project) {
    return res.status(404).json({ message: "Project not found" });
  }

  if (!canViewProject(req.user, project)) {
    return res.status(403).json({ message: "Forbidden" });
  }

  project.remarks.push({ text, createdBy: req.user._id });
  await project.save();

  const populated = await Project.findById(project._id).populate([
    { path: "serviceLine team createdBy", select: "name email employeeId role" },
    { path: "remarks.createdBy", select: "name employeeId" },
  ]);

  const finalProject = await resolveEmployeeNames(populated);
  res.status(200).json({ message: "Remark added", project: finalProject });
});

export const deleteProjectRemark = asyncHandler(async (req, res) => {
  const { id, remarkId } = req.validated.params;
  const project = await Project.findById(id);
  if (!project) {
    return res.status(404).json({ message: "Project not found" });
  }

  if (!canDeleteProject(req.user, project)) {
    return res.status(403).json({ message: "Forbidden" });
  }

  const remark = project.remarks.id(remarkId);
  if (!remark) {
    return res.status(404).json({ message: "Remark not found" });
  }

  remark.deleteOne();
  await project.save();

  const populated = await Project.findById(project._id).populate([
    { path: "serviceLine team createdBy", select: "name email employeeId role" },
    { path: "remarks.createdBy", select: "name employeeId" },
  ]);

  const finalProject = await resolveEmployeeNames(populated);
  res.status(200).json({ message: "Remark deleted", project: finalProject });
});
