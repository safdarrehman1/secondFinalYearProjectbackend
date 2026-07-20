const mongoose = require("mongoose");
const { toJSON, paginate } = require("./plugins");

const applicationSchema = mongoose.Schema(
  {
    job: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Job",
      required: true,
      index: true,
    },
    applicant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    resumeUrl: {
      type: String,
      default: "",
    },
    parsedResume: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    matchScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },
    test: {
      generatedAt: { type: Date, default: null },
      questions: [
        {
          id: { type: String },
          prompt: { type: String },
          type: { type: String, enum: ["mcq", "text"], default: "mcq" },
          options: [{ type: String }],
          expectedSignal: { type: String, default: "" },
          correctAnswer: { type: String, default: "" },
        },
      ],
      submittedAt: { type: Date, default: null },
      answers: [
        {
          questionId: { type: String },
          answer: { type: String },
        },
      ],
      evaluation: {
        type: mongoose.Schema.Types.Mixed,
        default: null,
      },
    },
    gamingFlags: {
      embeddingMismatch: { type: Boolean, default: false },
      cooldownViolation: { type: Boolean, default: false },
      evidenceSubstantiated: { type: Boolean, default: false },
    },
    status: {
      type: String,
      enum: [
        "applied",
        "screening",
        "test-sent",
        "test-completed",
        "under-review",
        "rejected",
        "shortlisted",
        "hired",
      ],
      default: "applied",
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound unique index — one application per user per job
applicationSchema.index({ job: 1, applicant: 1 }, { unique: true });

applicationSchema.plugin(toJSON);
applicationSchema.plugin(paginate);

const Application = mongoose.model("Application", applicationSchema);

module.exports = Application;
