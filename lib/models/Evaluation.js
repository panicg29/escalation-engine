import mongoose from "mongoose";

const ModelResponseSchema = new mongoose.Schema(
  {
    modelName: { type: String },
    modelId: { type: String },
    urgencyScore: { type: Number, min: 0, max: 10 },
    actionDecision: {
      type: String,
      enum: ["Escalate", "Log", "Mute"],
    },
    reasoning: { type: String },
    trigger_words: [{ type: String }],
    processingLatencyMs: { type: Number },
    userFeedback: {
      rating: { type: Number, enum: [1, -1] },
      humanCorrection: {
        type: String,
        enum: ["Escalate", "Log", "Mute"],
      },
      notes: { type: String },
    },
  },
  { _id: false }
);

const EvaluationSchema = new mongoose.Schema(
  {
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AnalysisSession",
      required: true,
      index: true,
    },
    originalMessage: { type: String, required: true },
    timeContext: {
      type: String,
      enum: ["Working Hours", "After Hours", "Weekend"],
    },
    expectedAction: {
      type: String,
      enum: ["Escalate", "Log", "Mute"],
    },
    modelResponses: [ModelResponseSchema],
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

// Add compound index for session queries with time filtering
EvaluationSchema.index({ sessionId: 1, createdAt: -1 });

export default mongoose.models.Evaluation ||
  mongoose.model("Evaluation", EvaluationSchema);
