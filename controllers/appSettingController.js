import asyncHandler from "../utils/asyncHandler.js";
import AppSetting from "../models/AppSetting.js";

const MAINTENANCE_KEY = "maintenance";

export const getMaintenanceStatus = asyncHandler(async (req, res) => {
  const setting = await AppSetting.findOne({ key: MAINTENANCE_KEY });
  res.status(200).json({ enabled: setting?.enabled || false });
});

export const updateMaintenanceStatus = asyncHandler(async (req, res) => {
  const { enabled } = req.validated.body;
  const setting = await AppSetting.findOneAndUpdate(
    { key: MAINTENANCE_KEY },
    { enabled: !!enabled, updatedBy: req.user._id },
    { new: true, upsert: true }
  );

  res.status(200).json({ enabled: setting.enabled });
});
