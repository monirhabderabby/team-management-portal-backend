import AppSetting from "../models/AppSetting.js";

const MAINTENANCE_KEY = "maintenance";
let cachedValue = null;
let lastCheckedAt = 0;
const CACHE_MS = 10000;

const maintenance = async (req, res, next) => {
  if (process.env.NODE_ENV !== "production") return next();

  const now = Date.now();
  if (now - lastCheckedAt > CACHE_MS || cachedValue === null) {
    const setting = await AppSetting.findOne({ key: MAINTENANCE_KEY });
    cachedValue = setting?.enabled || false;
    lastCheckedAt = now;
  }

  if (!cachedValue) return next();

  const allowlist = new Set([
    "/health",
    "/api/app-settings/maintenance",
    "/api/auth/login",
  ]);

  if (allowlist.has(req.path)) return next();

  return res.status(503).json({
    message: "Site is under maintenance mode",
    maintenance: true,
  });
};

export default maintenance;
