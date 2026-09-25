import mongoose from "mongoose";

const AlertSchema = new mongoose.Schema(
  {
    teamId: { type: String, required: true, index: true },
    userId: { type: String, required: true },
    userName: { type: String, default: "Team member" },
    text: { type: String, required: true },
    displayText: { type: String, default: "" },
    classification: {
      type: String,
      enum: ["Escalate", "Log", "Mute"],
      required: true,
    },
    reasoning: { type: String, default: "" },
    timestamp: { type: Date, default: Date.now },
    correctedAt: { type: Date, default: null },
    triageSource: {
      type: String,
      enum: ["exact", "semantic", "llm", "rules"],
      default: null,
    },
    similarityScores: { type: Number, default: null },
    semanticAutoApplied: { type: Boolean, default: false },
    matchedOverride: { type: String, default: null },
    slackMessageTs: { type: String, default: null, index: true },
    slackChannelId: { type: String, default: null },
    targetUserId: { type: String, default: null },
    targetUserName: { type: String, default: null },
    mentionedUserIds: { type: [String], default: [] },
    timerTrigger: { type: String, default: null },
    escalationTimeoutMs: { type: Number, default: null },
    voiceAttempts: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["pending", "resolved", "escalated", "escalating", "closed"],
      default: "resolved",
    },
    resolvedAt: { type: Date, default: null },
    resolvedByUserId: { type: String, default: null },
    resolutionType: { type: String, default: null },
    escalatedAt: { type: Date, default: null },
    callSid: { type: String, default: null, index: true },
    callOutcome: { type: String, default: null },
  },
  { versionKey: false }
);

AlertSchema.index({ teamId: 1, timestamp: -1 });
AlertSchema.index({ teamId: 1, slackMessageTs: 1, status: 1 });
// Add unique compound index to prevent duplicate Slack message processing
AlertSchema.index({ teamId: 1, slackMessageTs: 1 }, { 
  unique: true, 
  sparse: true, // Only enforce uniqueness when slackMessageTs is present
  name: 'teamId_slackMessageTs_unique'
});

const MODEL_NAME = "Alert";

if (mongoose.models[MODEL_NAME]) {
  delete mongoose.models[MODEL_NAME];
}
if (mongoose.modelNames().includes(MODEL_NAME)) {
  mongoose.deleteModel(MODEL_NAME);
}

export default mongoose.model(MODEL_NAME, AlertSchema);
