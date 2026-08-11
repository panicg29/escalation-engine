import mongoose from "mongoose";

const FeedbackSchema = new mongoose.Schema(
  {
    teamId: { type: String, required: true, index: true },
    textHash: { type: String, required: true },
    originalText: { type: String, required: true },
    userOverride: {
      type: String,
      enum: ["Escalate", "Log", "Mute"],
      required: true,
    },
    userReasoning: { type: String, default: "" },
    // Vector embeddings for similarity search optimization
    // Requires Atlas Vector Search index for optimal performance
    embedding: { type: [Number], default: [] },
    timestamp: { type: Date, default: Date.now },
    sourceAlertId: { type: String, default: "" },
  },
  { versionKey: false }
);

FeedbackSchema.index({ teamId: 1, textHash: 1 }, { unique: true });

// Note: For optimal vector search performance, create an Atlas Vector Search index:
// Index name: "embedding_vector_index"  
// Path: "embedding"
// Similarity: "cosine"
// Dimensions: 1536 (OpenAI embedding size)
// Filter paths: ["teamId"]

const MODEL_NAME = "Feedback";

if (mongoose.models[MODEL_NAME]) {
  delete mongoose.models[MODEL_NAME];
}
if (mongoose.modelNames().includes(MODEL_NAME)) {
  mongoose.deleteModel(MODEL_NAME);
}

export default mongoose.model(MODEL_NAME, FeedbackSchema);
