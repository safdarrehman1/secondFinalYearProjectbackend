const mongoose = require("mongoose");
const { toJSON, paginate } = require("./plugins");

const jobSchema = mongoose.Schema(
  {
    projectTitle: {
      type: String,
      required: true,
    },
    createdOn: {
      type: Date,
    },
    status: {
      type: String,
      enum: ["active", "inreview", "inactive"],
      default: "active",
    },
    activePeriod: {
      type: Number,
      default: 20,
    },
    isFreeExtensionUsed: {
      type: Boolean,
      default: false,
    },
    expiresAt: {
      type: Date,
    },
    category: [
      {
        type: String,
        required: true,
      },
    ],
    budget: {
      type: String,
      required: true,
    },
    timeFrame: {
      type: String,
      required: true,
    },
    preferredLocation: {
      type: String,
    },
    description: {
      type: String,
      required: true,
    },
    position: {
      type: String,
    },
    applicantName: {
      type: String,
    },
    cultureArea: [
      {
        type: String,
      },
    ],
    designCategory: {
      type: String,
    },
    designSubcategory: {
      type: [String],
      default: [],
    },
    jobType: {
      type: [String],
      default: [],
    },
    applicantAvatar: {
      type: String,
    },
    applicantBackgroundImage: {
      type: String,
    },
    savedBy: [
      {
        type: String,
      },
    ],
    likes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    createdBy: {
      type: String,
      required: true,
    },
    paymentId: {
      type: String,
    },
    employmentType: {
      type: String,
      enum: ["freelance-project", "full-time", "part-time", "contract", "internship"],
      default: "freelance-project",
    },
    workMode: {
      type: String,
      enum: ["remote", "onsite", "hybrid"],
      default: "remote",
    },
    applicationFlow: {
      type: String,
      enum: ["proposal", "resume-application"],
      default: "proposal",
    },
    orderTracking: {
      orderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order" },
      assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      status: {
        type: String,
        enum: ["not_started", "in_progress", "completed", "cancelled"],
        default: "not_started",
      },
      startedAt: Date,
      completedAt: Date,
    },
    salaryRange: {
      min: { type: Number },
      max: { type: Number },
      currency: { type: String, default: "USD" },
    },
    requiredExperience: {
      type: String,
    },
    requiredSkills: [
      {
        type: String,
      },
    ],
    questionSource: {
      type: String,
      enum: ["ai", "manual"],
      default: "ai",
    },
    customQuestions: [
      {
        questionText: { type: String, required: true },
        type: { type: String, enum: ["mcq", "text"], default: "mcq" },
        options: [{ type: String }],
        correctAnswer: { type: String },
      },
    ],
  },
  {
    timestamps: true,
  },
);

jobSchema.plugin(toJSON);
jobSchema.plugin(paginate);
jobSchema.index({ createdAt: -1 });
jobSchema.index({ status: 1, createdAt: -1 });

const Job = mongoose.model("Job", jobSchema);

module.exports = Job;
