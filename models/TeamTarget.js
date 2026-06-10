import mongoose from "mongoose";

const teamTargetSchema = new mongoose.Schema(
  {
    team: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Team",
      required: true,
    },
    month: {
      type: Number,
      required: true,
      min: 1,
      max: 12,
    },
    year: {
      type: Number,
      required: true,
    },
    target: {
      type: Number,
      min: 0,
      default: 0,
    },
    setBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

teamTargetSchema.index({ team: 1, month: 1, year: 1 }, { unique: true });

const TeamTarget = mongoose.model("TeamTarget", teamTargetSchema);

export default TeamTarget;
