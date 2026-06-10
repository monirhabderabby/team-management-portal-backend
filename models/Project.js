import mongoose from "mongoose";

const remarkSchema = new mongoose.Schema(
  {
    text: { type: String, required: true, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const projectSchema = new mongoose.Schema(
  {
    projectId: { type: String, required: true, unique: true },
    clientName: { type: String, required: true, trim: true },
    profileName: { type: String, required: true, trim: true },
    orderId: { type: String, required: true, trim: true },
    employeeId: { type: String, required: true, trim: true },
    serviceLine: { type: mongoose.Schema.Types.ObjectId, ref: "ServiceLine", required: true },
    team: { type: mongoose.Schema.Types.ObjectId, ref: "Team", required: true },
    amount: { type: Number, required: true, min: 0 },
    startDate: { type: Date, required: true },
    deadline: { type: Date, required: true },
    nextWipDeadline: { type: Date, required: true },
    deliveryDate: { type: Date },
    status: {
      type: String,
      enum: ["WIP", "Delivered", "Cancelled", "Revision", "Hold", "Pending"],
      required: true,
    },
    instructionSheet: { type: String },
    clientRating: { type: Number, min: 1, max: 5 },
    remarks: [remarkSchema],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

const Project = mongoose.model("Project", projectSchema);

export default Project;
