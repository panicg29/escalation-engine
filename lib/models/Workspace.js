import mongoose from "mongoose";

const WorkspaceSchema = new mongoose.Schema(
  {
    teamId: { type: String, required: true, unique: true, index: true },
    teamName: { type: String, required: true, default: "Slack Workspace" },
    botAccessToken: { type: String, required: true },
    incomingChannelId: { type: String, default: "" },
    incomingChannelName: { type: String, default: "" },
    /** Slack user who owns Sentinel notifications for this workspace */
    targetUserId: { type: String, default: "", index: true },
    targetUserName: { type: String, default: "" },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
      index: true,
    },
    connected: { type: Boolean, default: true, index: true },
    disconnectedAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

WorkspaceSchema.pre("save", function markUpdated(next) {
  this.updatedAt = new Date();
  next();
});

const MODEL_NAME = "Workspace";

if (mongoose.models[MODEL_NAME]) {
  delete mongoose.models[MODEL_NAME];
}
if (mongoose.modelNames().includes(MODEL_NAME)) {
  mongoose.deleteModel(MODEL_NAME);
}

export default mongoose.model(MODEL_NAME, WorkspaceSchema);
