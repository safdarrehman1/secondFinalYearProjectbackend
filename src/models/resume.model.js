const mongoose = require("mongoose");
const { toJSON, paginate } = require("./plugins");

const resumeSchema = mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    templateId: {
      type: String,
      required: true,
      trim: true,
    },
    title: {
      type: String,
      trim: true,
      default: "Untitled Resume",
    },
    sections: {
      personalInfo: {
        fullName: { type: String, trim: true, default: "" },
        email: { type: String, trim: true, default: "" },
        phone: { type: String, trim: true, default: "" },
        location: { type: String, trim: true, default: "" },
        linkedin: { type: String, trim: true, default: "" },
        website: { type: String, trim: true, default: "" },
        photoUrl: { type: String, trim: true, default: "" },
      },
      summary: { type: String, default: "" },
      experience: [
        {
          company: { type: String, trim: true, default: "" },
          role: { type: String, trim: true, default: "" },
          location: { type: String, trim: true, default: "" },
          startDate: { type: String, trim: true, default: "" },
          endDate: { type: String, trim: true, default: "" },
          current: { type: Boolean, default: false },
          bullets: [{ type: String, trim: true }],
        },
      ],
      education: [
        {
          institution: { type: String, trim: true, default: "" },
          degree: { type: String, trim: true, default: "" },
          field: { type: String, trim: true, default: "" },
          startDate: { type: String, trim: true, default: "" },
          endDate: { type: String, trim: true, default: "" },
          gpa: { type: String, trim: true, default: "" },
        },
      ],
      skills: [{ type: String, trim: true }],
      projects: [
        {
          name: { type: String, trim: true, default: "" },
          description: { type: String, default: "" },
          link: { type: String, trim: true, default: "" },
          tech: [{ type: String, trim: true }],
        },
      ],
      certifications: [
        {
          name: { type: String, trim: true, default: "" },
          issuer: { type: String, trim: true, default: "" },
          date: { type: String, trim: true, default: "" },
        },
      ],
      custom: [
        {
          sectionTitle: { type: String, trim: true, default: "Additional Section" },
          content: { type: String, default: "" },
        },
      ],
    },
    colorTheme: {
      type: String,
      default: "#0f172a",
    },
    status: {
      type: String,
      enum: ["draft", "finalized"],
      default: "draft",
    },
    exportedPdfUrl: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

// Add plugin that converts mongoose to json
resumeSchema.plugin(toJSON);
resumeSchema.plugin(paginate);

// Index on user
resumeSchema.index({ user: 1 });
resumeSchema.index({ createdAt: -1 });

/**
 * @typedef Resume
 */
const Resume = mongoose.model("Resume", resumeSchema);

module.exports = Resume;
