const mongoose = require("mongoose");
const schema = new mongoose.Schema({
  job: { type: mongoose.Schema.Types.ObjectId, ref: "FiltrationJob", required: true, index: true },
  candidate: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  resume: { type: mongoose.Schema.Types.ObjectId, ref: "FiltrationResume" },
  resumeUrl: String, resumeText: { type: String, select: false }, resumeFingerprint: { type: String, index: true },
  resumeScore: { raw: Number, weighted: Number, breakdown: mongoose.Schema.Types.Mixed, provider: String, model: String, scoringVersion: String, confidence: Number, explanation: String, overriddenBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, overrideReason: String, overriddenAt: Date },
  resumeStatus: { type: String, enum: ["pending", "passed", "failed"], default: "pending" },
  test: { type: mongoose.Schema.Types.ObjectId, ref: "FiltrationTest" },
  testScore: Number, testBreakdown: mongoose.Schema.Types.Mixed,
  testStatus: { type: String, enum: ["locked", "unlocked", "in_progress", "completed"], default: "locked" },
  testStartedAt: Date,
  testExpiresAt: Date,
  draftAnswers: [{ questionId: mongoose.Schema.Types.ObjectId, response: String, savedAt: { type: Date, default: Date.now } }],
  finalStatus: { type: String, enum: ["applied", "resume_screening", "resume_screened", "resume_passed", "resume_failed", "test_unlocked", "test_in_progress", "test_completed", "under_review", "interview_requested", "interview_scheduled", "shortlisted", "hired", "rejected", "withdrawn"], default: "applied", index: true },
  flaggedForReview: { type: Boolean, default: false }, flagReason: String, reapplyAfter: Date,
  posterNotes: { type: String, trim: true, maxlength: 5000 },
  tags: [{ type: String, trim: true, maxlength: 50 }],
  rejectionReason: { type: String, trim: true, maxlength: 1000 },
  improvementReport: {
    generatedAt: Date,
    score: Number,
    provider: String,
    summary: { type: String, trim: true, maxlength: 2000 },
    items: [{
      skill: { type: String, trim: true, maxlength: 100 },
      whyItMatters: { type: String, trim: true, maxlength: 500 },
      action: { type: String, trim: true, maxlength: 500 },
      evidenceNeeded: { type: String, trim: true, maxlength: 500 },
    }],
  },
  withdrawnAt: Date,
  statusHistory: [{
    from: String, to: { type: String, required: true }, changedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    reason: { type: String, trim: true }, changedAt: { type: Date, default: Date.now },
  }],
}, { timestamps: true, collection: "filtration_applications" });
schema.index({ job: 1, candidate: 1, createdAt: -1 });
schema.index({ job: 1, finalStatus: 1, createdAt: -1 });
schema.index({ job: 1, flaggedForReview: 1, createdAt: -1 });
module.exports = mongoose.model("FiltrationApplication", schema);
