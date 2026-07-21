const mongoose = require("mongoose");

const aiLogSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    endpoint: { type: String, required: true, trim: true, index: true },
    model: { type: String, required: true, trim: true },
    promptTokens: { type: Number, default: 0 },
    completionTokens: { type: Number, default: 0 },
    totalTokens: { type: Number, default: 0 },
    latencyMs: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["success", "failed"],
      required: true,
      index: true,
    },
    errorMessage: { type: String, trim: true },
  },
  { timestamps: true, collection: "ai_logs" }
);

aiLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model("AiLog", aiLogSchema);
