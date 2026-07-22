const mongoose = require("mongoose");

const scoringConfigSchema = new mongoose.Schema({
  skillWeight: { type: Number, min: 0, max: 1, required: true },
  experienceWeight: { type: Number, min: 0, max: 1, required: true },
  stabilityWeight: { type: Number, min: 0, max: 1, required: true },
}, { _id: false });

const lifecycleEventSchema = new mongoose.Schema({
  from: String,
  to: { type: String, required: true },
  changedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  reason: { type: String, trim: true },
  changedAt: { type: Date, default: Date.now },
}, { _id: false });

const filtrationJobSchema = new mongoose.Schema({
  poster: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  type: { type: String, enum: ["gig", "full_time"], required: true, index: true },
  title: { type: String, required: true, trim: true },
  description: { type: String, required: true, trim: true },
  status: { type: String, enum: ["draft", "scheduled", "published", "paused", "filled", "closed", "archived"], default: "draft", index: true },
  publishAt: Date,
  expiresAt: { type: Date, index: true },
  filledAt: Date,
  closedAt: Date,
  lifecycleHistory: { type: [lifecycleEventSchema], default: [] },
  scoringConfig: { type: scoringConfigSchema, required: true },
  minResumePct: { type: Number, min: 0, max: 100, default: 60 },
  minTestPct: { type: Number, min: 0, max: 100, default: 60 },
  cooldownDays: { type: Number, min: 0, max: 365, default: 30 },
  gigDetails: {
    budget: Number, deadline: Date, deliverables: [String], skillsRequired: [String], durationEstimate: String,
  },
  fullTimeDetails: {
    salaryMin: Number, salaryMax: Number, location: String,
    workMode: { type: String, enum: ["remote", "onsite", "hybrid"] },
    department: String,
    employmentType: { type: String, enum: ["contract", "permanent"] },
    experienceRequiredYears: Number, jdDocumentUrl: String,
  },
}, { timestamps: true, collection: "filtration_jobs" });

filtrationJobSchema.index({ status: 1, type: 1, createdAt: -1 });
filtrationJobSchema.index({ poster: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model("FiltrationJob", filtrationJobSchema);
