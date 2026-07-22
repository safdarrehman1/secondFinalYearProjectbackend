const mongoose = require("mongoose");
const schema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 200 },
  originalName: { type: String, required: true }, url: { type: String, required: true }, storageKey: String,
  mimeType: { type: String, enum: ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain"], required: true },
  size: { type: Number, required: true, max: 8 * 1024 * 1024 },
  extractedText: { type: String, required: true, select: false },
  parseStatus: { type: String, enum: ["parsed", "manual_review"], default: "parsed" },
}, { timestamps: true, collection: "filtration_resumes" });
schema.index({ owner: 1, createdAt: -1 });
module.exports = mongoose.model("FiltrationResume", schema);
