import asyncHandler from "../utils/asyncHandler.js";
import Project from "../models/Project.js";
import User from "../models/User.js";
import ServiceLine from "../models/ServiceLine.js";
import Team from "../models/Team.js";
import { ROLES } from "../config/constants.js";

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
    }
  }

  const start = new Date(year, monthIndex, 1, 0, 0, 0, 0);
  const end = new Date(year, monthIndex + 1, 1, 0, 0, 0, 0);
  return { monthIndex, year, start, end };
};

/**
 * Score formula:
 *   deliveredAmount * 1.0
 * - cancelAmount   * 0.5
 * - revisionCount  * 20
 * + deliveredCount * 10
 *
 * Higher is better.
 */
const calcScore = (r) =>
  Math.round(
    r.deliveredAmount * 1 -
    r.cancelAmount * 0.5 -
    r.revisionCount * 20 +
    r.deliveredCount * 10
  );

export const listRanking = asyncHandler(async (req, res) => {
  const { monthIndex, year, start, end } = parseMonthYear(req.query);
  const role = req.user?.role;
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 10));
  const includeAllWip = ["1", "true", "yes"].includes(
    String(req.query.allWip || "").toLowerCase(),
  );

  // Determine filters
  let serviceLineFilter = req.query.serviceLine || null;
  let teamFilter = req.query.team || null;
  if (serviceLineFilter === "all") serviceLineFilter = null;
  if (teamFilter === "all") teamFilter = null;

  // Role‑based restrictions
  // PM, TL, MEMBER → locked to their service line, team filter is optional
  if (role === ROLES.PROJECT_MANAGER) {
    serviceLineFilter = req.user.serviceLine ? String(req.user.serviceLine) : null;
  } else if (role === ROLES.TEAM_LEADER || role === ROLES.MEMBER) {
    serviceLineFilter = req.user.serviceLine ? String(req.user.serviceLine) : null;
    // team filter stays as user selected (or null for all teams in their service line)
  }

  // Fetch projects in the month window
  const projectFilter = { nextWipDeadline: { $gte: start, $lt: end } };
  if (serviceLineFilter) projectFilter.serviceLine = serviceLineFilter;
  if (teamFilter) projectFilter.team = teamFilter;

  const projects = await Project.find(projectFilter)
    .select("employeeId amount status serviceLine team")
    .lean();

  let allWipMap = new Map();
  if (includeAllWip) {
    const allWipFilter = { status: "WIP" };
    if (serviceLineFilter) allWipFilter.serviceLine = serviceLineFilter;
    if (teamFilter) allWipFilter.team = teamFilter;
    const allWipProjects = await Project.find(allWipFilter)
      .select("employeeId amount")
      .lean();
    for (const p of allWipProjects) {
      const eid = String(p.employeeId || "");
      if (!eid) continue;
      if (!allWipMap.has(eid)) {
        allWipMap.set(eid, { amount: 0, count: 0 });
      }
      const entry = allWipMap.get(eid);
      entry.amount += Number(p.amount || 0);
      entry.count += 1;
    }
  }

  // Aggregate per employeeId
  const map = new Map();
  for (const p of projects) {
    const eid = String(p.employeeId || "");
    if (!eid) continue;
    if (!map.has(eid)) {
      map.set(eid, {
        employeeId: eid,
        deliveredAmount: 0,
        deliveredCount: 0,
        cancelAmount: 0,
        cancelCount: 0,
        revisionAmount: 0,
        revisionCount: 0,
        wipAmount: 0,
        wipCount: 0,
        projectCount: 0,
      });
    }
    const r = map.get(eid);
    const amt = Number(p.amount || 0);
    r.projectCount += 1;
    if (p.status === "Delivered") { r.deliveredAmount += amt; r.deliveredCount += 1; }
    else if (p.status === "Cancelled") { r.cancelAmount += amt; r.cancelCount += 1; }
    else if (p.status === "Revision") { r.revisionAmount += amt; r.revisionCount += 1; }
    else if (p.status === "WIP") { r.wipAmount += amt; r.wipCount += 1; }
  }

  // Enrich with user info
  const empIds = [...map.keys()];
  const users = await User.find({ employeeId: { $in: empIds } })
    .select("name employeeId role serviceLine team monthlyTarget profileImage")
    .populate("serviceLine", "name")
    .populate("team", "name")
    .lean();

  const userMap = new Map();
  for (const u of users) userMap.set(String(u.employeeId), u);

  const rows = [];
  for (const [eid, r] of map) {
    const u = userMap.get(eid);
    const allWip = allWipMap.get(eid) || { amount: 0, count: 0 };
    const target = Number(u?.monthlyTarget || 0);
    const remaining = target > 0 ? target - r.deliveredAmount : 0;
    const totalActivity = r.cancelAmount + r.deliveredAmount + r.wipAmount + r.revisionAmount;
    const cancelPercent = totalActivity > 0 ? Math.round((r.cancelAmount / totalActivity) * 1000) / 10 : 0;
    const status = target > 0 && r.deliveredAmount >= target ? "Achieved" : "In progress";

    rows.push({
      employeeId: eid,
      name: u?.name || eid,
      role: u?.role || "MEMBER",
      profileImage: u?.profileImage || null,
      serviceLine: u?.serviceLine ? { id: u.serviceLine._id, name: u.serviceLine.name } : null,
      team: u?.team ? { id: u.team._id, name: u.team.name } : null,
      deliveredAmount: r.deliveredAmount,
      deliveredCount: r.deliveredCount,
      cancelAmount: r.cancelAmount,
      cancelCount: r.cancelCount,
      revisionAmount: r.revisionAmount,
      revisionCount: r.revisionCount,
      wipAmount: r.wipAmount,
      wipCount: r.wipCount,
      allWipAmount: allWip.amount,
      allWipCount: allWip.count,
      projectCount: r.projectCount,
      target,
      remaining,
      cancelPercent,
      status,
      score: calcScore(r),
    });
  }

  // Sort by deliveredAmount descending (tie-breakers for stable ordering only)
  rows.sort((a, b) => {
    if (b.deliveredAmount !== a.deliveredAmount) return b.deliveredAmount - a.deliveredAmount;
    if (b.deliveredCount !== a.deliveredCount) return b.deliveredCount - a.deliveredCount;
    return String(a.name || "").localeCompare(String(b.name || ""));
  });

  // Assign dense rank based on deliveredAmount
  let lastAmount = null;
  let rank = 0;
  rows.forEach((r) => {
    if (lastAmount === null || r.deliveredAmount !== lastAmount) {
      rank += 1;
      lastAmount = r.deliveredAmount;
    }
    r.rank = rank;
  });

  // Search filter (name or employeeId)
  const searchTerm = String(req.query.search || "").trim().toLowerCase();
  const filteredRows = searchTerm
    ? rows.filter(
        (r) =>
          String(r.name || "").toLowerCase().includes(searchTerm) ||
          String(r.employeeId || "").toLowerCase().includes(searchTerm),
      )
    : rows;

  const total = filteredRows.length;
  const startIndex = (page - 1) * limit;
  const pagedRows = filteredRows.slice(startIndex, startIndex + limit);
  const topRows = rows.slice(0, 3);

  // Summary counts
  const totalDelivered = rows.reduce((s, r) => s + r.deliveredAmount, 0);
  const totalCancelled = rows.reduce((s, r) => s + r.cancelAmount, 0);
  const totalRevisions = rows.reduce((s, r) => s + r.revisionCount, 0);
  const totalProjects = rows.reduce((s, r) => s + r.projectCount, 0);
  const totalWip = rows.reduce((s, r) => s + r.wipAmount, 0);

  // Meta for filters
  let serviceLines = [];
  if (role === ROLES.SUPER_ADMIN) {
    serviceLines = await ServiceLine.find({}).select("name").sort({ name: 1 }).lean();
  } else if (role === ROLES.PROJECT_MANAGER && req.user.serviceLine) {
    serviceLines = await ServiceLine.find({ _id: req.user.serviceLine }).select("name").lean();
  }

  let teams = [];
  const teamQuery = {};
  if (serviceLineFilter) teamQuery.serviceLine = serviceLineFilter;
  teams = await Team.find(teamQuery).select("name serviceLine").populate("serviceLine", "name").sort({ name: 1 }).lean();

  res.status(200).json({
    month: monthIndex + 1,
    year,
    rows: pagedRows,
    topRows,
    summary: { totalDelivered, totalCancelled, totalRevisions, totalProjects, totalWip },
    serviceLines,
    teams,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  });
});
