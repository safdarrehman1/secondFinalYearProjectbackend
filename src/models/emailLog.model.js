const mongoose = require("mongoose");

const emailLogSchema = new mongoose.Schema(
  {
    to: { type: String, required: true, trim: true, index: true },
    subject: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ["success", "failed"],
      required: true,
      index: true,
    },
    attempts: { type: Number, default: 1 },
    errorMessage: { type: String, trim: true },
    responseId: { type: String, trim: true },
  },
  { timestamps: true, collection: "email_logs" }
);

emailLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model("EmailLog", emailLogSchema);
