import mongoose from "mongoose";

const teamSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    serviceLine: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ServiceLine",
      required: true,
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
    teamTarget: {
      type: Number,
      min: 0,
      default: 0,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

teamSchema.index({ name: 1, serviceLine: 1 }, { unique: true });

const Team = mongoose.model("Team", teamSchema);

export default Team;
