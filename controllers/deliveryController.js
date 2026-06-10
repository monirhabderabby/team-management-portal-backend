import asyncHandler from "../utils/asyncHandler.js";
import Project from "../models/Project.js";
import Team from "../models/Team.js";
import TeamTarget from "../models/TeamTarget.js";
import ServiceLine from "../models/ServiceLine.js";
import User from "../models/User.js";
import { ROLES } from "../config/constants.js";

/* ── helpers ── */

const parseMonthYear = (query) => {
  const now = new Date();
  const rawMonth = Number.parseInt(query.month, 10);
  const rawYear = Number.parseInt(query.year, 10);
  let monthIndex = now.getMonth();
  let year = now.getFullYear();

  if (!Number.isNaN(rawMonth) && !Number.isNaN(rawYear)) {
    if (rawMonth >= 1 && rawMonth <= 12) {
      monthIndex = rawMonth - 1;
      year = rawYear;
    } else if (rawMonth >= 0 && rawMonth <= 11) {
      monthIndex = rawMonth;
      year = rawYear;
    }
  }

  const start = new Date(year, monthIndex, 1, 0, 0, 0, 0);
  const end = new Date(year, monthIndex + 1, 1, 0, 0, 0, 0);
  return { monthIndex, year, start, end };
};

const normalizeFilter = (value) => {
  if (!value || value === "all") return undefined;
  return value;
};

const buildTotals = (rows) => {
  return rows.reduce(
    (acc, row) => {
      acc.deliveredAmount += row.deliveredAmount;
      acc.deliveredCount += row.deliveredCount;
      acc.wipAmount += row.wipAmount;
      acc.wipCount += row.wipCount;
      acc.cancelAmount += row.cancelAmount;
      acc.cancelCount += row.cancelCount;
      acc.revisionAmount += row.revisionAmount;
      acc.revisionCount += row.revisionCount;
      return acc;
    },
    {
      deliveredAmount: 0,
      deliveredCount: 0,
      wipAmount: 0,
      wipCount: 0,
      cancelAmount: 0,
      cancelCount: 0,
      revisionAmount: 0,
      revisionCount: 0,
    }
  );
};

/**
 * Compute cancel percentage:
 *   cancel / (cancel + delivered + wip + revision) * 100
 */
const calcCancelPercent = (cancel, delivered, wip, revision) => {
  const total = cancel + delivered + wip + revision;
  if (total === 0) return 0;
  return Math.round((cancel / total) * 1000) / 10; // 1 decimal
};

/* ── controllers ── */

export const listDeliverySummary = asyncHandler(async (req, res) => {
  const { monthIndex, year, start, end } = parseMonthYear(req.query);
  const role = req.user?.role;
  const monthNum = monthIndex + 1; // 1-based month for TeamTarget lookup

  const serviceLineParam = normalizeFilter(req.query.serviceLine);
  const teamParam = normalizeFilter(req.query.team);

  let serviceLineFilter = serviceLineParam;
  let teamFilter = teamParam;

  if (role === ROLES.PROJECT_MANAGER) {
    if (!req.user.serviceLine) {
      return res.status(403).json({ message: "Forbidden" });
    }
    if (serviceLineParam && String(serviceLineParam) !== String(req.user.serviceLine)) {
      return res.status(403).json({ message: "Forbidden" });
    }
    serviceLineFilter = req.user.serviceLine;
  }

  if (role === ROLES.TEAM_LEADER) {
    if (!req.user.team) {
      return res.status(403).json({ message: "Forbidden" });
    }
    // Allow TL to see other teams for comparison, but restrict to their service line
    if (serviceLineParam && req.user.serviceLine) {
      if (String(serviceLineParam) !== String(req.user.serviceLine)) {
        return res.status(403).json({ message: "Forbidden" });
      }
    }
    if (req.user.serviceLine) {
      serviceLineFilter = req.user.serviceLine;
    }
  }

  // Build project filter based on nextWipDeadline date range
  const projectFilter = {
    nextWipDeadline: { $gte: start, $lt: end },
  };
  if (serviceLineFilter) {
    projectFilter.serviceLine = serviceLineFilter;
  }
  // The projectFilter (used for totals) will respect the teamParam
  if (teamParam) {
    projectFilter.team = teamParam;
  }

  const projects = await Project.find(projectFilter)
    .select("employeeId amount status serviceLine team nextWipDeadline")
    .populate("serviceLine team", "name");

  // Build team rows - always show all teams in the service line for context
  const teamQuery = {};
  if (serviceLineFilter) {
    teamQuery.serviceLine = serviceLineFilter;
  }
  const teams = await Team.find(teamQuery)
    .select("name serviceLine")
    .populate("serviceLine", "name")
    .sort({ name: 1 });

  // Fetch per-month targets from TeamTarget collection
  const teamIds = teams.map((t) => t._id);
  const targetQuery = { month: monthNum, year };
  if (teamIds.length > 0) {
    targetQuery.team = { $in: teamIds };
  }
  const monthlyTargets = await TeamTarget.find(targetQuery).select("team target").lean();
  const targetMap = new Map();
  monthlyTargets.forEach((mt) => {
    targetMap.set(String(mt.team), Number(mt.target || 0));
  });

  const teamMap = new Map();
  teams.forEach((team) => {
    teamMap.set(String(team._id), {
      id: String(team._id),
      name: team.name,
      serviceLine: team.serviceLine
        ? { id: team.serviceLine._id, name: team.serviceLine.name }
        : null,
      deliveredAmount: 0,
      deliveredCount: 0,
      wipAmount: 0,
      wipCount: 0,
      cancelAmount: 0,
      cancelCount: 0,
      revisionAmount: 0,
      revisionCount: 0,
      target: targetMap.get(String(team._id)) || 0,
    });
  });

  projects.forEach((project) => {
    const teamId = String(project.team?._id || project.team || "");
    const row = teamMap.get(teamId);
    if (!row) return;

    const amount = Number(project.amount || 0);
    if (project.status === "Delivered") {
      row.deliveredAmount += amount;
      row.deliveredCount += 1;
    } else if (project.status === "WIP") {
      row.wipAmount += amount;
      row.wipCount += 1;
    } else if (project.status === "Cancelled") {
      row.cancelAmount += amount;
      row.cancelCount += 1;
    } else if (project.status === "Revision") {
      row.revisionAmount += amount;
      row.revisionCount += 1;
    }
  });

  const teamRows = Array.from(teamMap.values()).map((row) => {
    const remaining = row.target > 0 ? row.target - row.deliveredAmount : 0;
    const cancelPercent = calcCancelPercent(
      row.cancelAmount,
      row.deliveredAmount,
      row.wipAmount,
      row.revisionAmount
    );

    return {
      ...row,
      remaining,        // positive = still need to deliver, negative = extra delivered
      cancelPercent,
      status: row.target > 0 && row.deliveredAmount >= row.target ? "Achieved" : "In progress",
    };
  });

  // Build member rows grouped by team
  const memberMap = new Map();
  projects.forEach((project) => {
    const empId = String(project.employeeId || "");
    const teamId = String(project.team?._id || project.team || "");
    const key = `${empId}__${teamId}`;

    if (!memberMap.has(key)) {
      memberMap.set(key, {
        employeeId: empId,
        teamId: teamId,
        teamName: project.team?.name || "-",
        serviceLineName: project.serviceLine?.name || "-",
        deliveredAmount: 0,
        deliveredCount: 0,
        wipAmount: 0,
        wipCount: 0,
        cancelAmount: 0,
        cancelCount: 0,
        revisionAmount: 0,
        revisionCount: 0,
      });
    }

    const row = memberMap.get(key);
    const amount = Number(project.amount || 0);
    if (project.status === "Delivered") {
      row.deliveredAmount += amount;
      row.deliveredCount += 1;
    } else if (project.status === "WIP") {
      row.wipAmount += amount;
      row.wipCount += 1;
    } else if (project.status === "Cancelled") {
      row.cancelAmount += amount;
      row.cancelCount += 1;
    } else if (project.status === "Revision") {
      row.revisionAmount += amount;
      row.revisionCount += 1;
    }
  });

  // Enrich member rows with user name from User collection
  const allEmployeeIds = [...new Set(Array.from(memberMap.values()).map((r) => r.employeeId))];
  const users = await User.find({ employeeId: { $in: allEmployeeIds } })
    .select("name employeeId")
    .lean();
  const userNameMap = new Map();
  users.forEach((u) => {
    userNameMap.set(String(u.employeeId), u.name);
  });

  const memberRows = Array.from(memberMap.values())
    .map((row) => ({
      ...row,
      name: userNameMap.get(row.employeeId) || row.employeeId,
    }))
    .sort((a, b) => b.deliveredAmount - a.deliveredAmount);

  const totals = buildTotals(teamRows);

  let serviceLines = [];
  if (role === ROLES.PROJECT_MANAGER) {
    if (req.user.serviceLine) {
      serviceLines = await ServiceLine.find({ _id: req.user.serviceLine })
        .select("name")
        .sort({ name: 1 });
    }
  } else if (role === ROLES.TEAM_LEADER) {
    if (req.user.serviceLine) {
      serviceLines = await ServiceLine.find({ _id: req.user.serviceLine })
        .select("name")
        .sort({ name: 1 });
    }
  } else {
    serviceLines = await ServiceLine.find({}).select("name").sort({ name: 1 });
  }

  res.status(200).json({
    month: monthNum,
    year,
    memberRows,
    teamRows,
    totals,
    serviceLines,
    teams,
  });
});

export const setTeamDeliveryTarget = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { teamTarget, month, year } = req.body;
  const role = req.user?.role;

  if (role !== ROLES.SUPER_ADMIN && role !== ROLES.PROJECT_MANAGER) {
    return res.status(403).json({ message: "Forbidden" });
  }

  const targetValue = Number(teamTarget || 0);
  if (targetValue < 0) {
    return res.status(400).json({ message: "Target must be a positive number" });
  }

  const monthNum = Number(month);
  const yearNum = Number(year);
  if (!monthNum || monthNum < 1 || monthNum > 12 || !yearNum) {
    return res.status(400).json({ message: "Valid month (1-12) and year are required" });
  }

  // Verify team exists
  const existing = await Team.findById(id).select("serviceLine name");
  if (!existing) {
    return res.status(404).json({ message: "Team not found" });
  }

  // PM can only set targets for teams in their service line
  if (role === ROLES.PROJECT_MANAGER) {
    if (String(existing.serviceLine) !== String(req.user.serviceLine)) {
      return res.status(403).json({ message: "Forbidden" });
    }
  }

  // Upsert the monthly target
  const result = await TeamTarget.findOneAndUpdate(
    { team: id, month: monthNum, year: yearNum },
    {
      target: targetValue,
      setBy: req.user._id,
    },
    { new: true, upsert: true }
  );

  res.status(200).json({
    message: "Target updated",
    teamTarget: {
      id: String(result._id),
      team: String(id),
      teamName: existing.name,
      month: monthNum,
      year: yearNum,
      target: result.target,
    },
  });
});
