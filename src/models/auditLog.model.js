const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema(
  {
    actor: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    action: { type: String, required: true, trim: true, index: true },
    resourceType: { type: String, required: true, trim: true, index: true },
    resourceId: { type: String, trim: true, index: true },
    outcome: {
      type: String,
      enum: ["success", "failure"],
      default: "success",
      index: true,
    },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    ipAddress: String,
    userAgent: String,
  },
  { timestamps: true, collection: "audit_logs" },
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ resourceType: 1, resourceId: 1, createdAt: -1 });

module.exports = mongoose.model("AuditLog", auditLogSchema);
