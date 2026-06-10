import mongoose from "mongoose";

const announcementSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    // Scope – set when a TEAM_LEADER creates the announcement.
    // null means global (SUPER_ADMIN / PROJECT_MANAGER level).
    team: { type: mongoose.Schema.Types.ObjectId, ref: "Team", default: null },
    serviceLine: { type: mongoose.Schema.Types.ObjectId, ref: "ServiceLine", default: null },
  },
  { timestamps: true }
);

const Announcement = mongoose.model("Announcement", announcementSchema);

export default Announcement;
