import mongoose from "mongoose";

const AnalysisSessionSchema = new mongoose.Schema(
  {
    sessionName: { type: String, required: true },
    datasetSource: { type: String },
    createdAt: { type: Date, default: Date.now },
    totalMessages: { type: Number, default: 0 },
  },
  { versionKey: false }
);

export default mongoose.models.AnalysisSession ||
  mongoose.model("AnalysisSession", AnalysisSessionSchema);
