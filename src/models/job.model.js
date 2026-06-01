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
  },
  {
    timestamps: true,
  },
);

jobSchema.plugin(toJSON);
jobSchema.plugin(paginate);

const Job = mongoose.model("Job", jobSchema);

module.exports = Job;
