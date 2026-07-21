const mongoose = require("mongoose");
const schema = new mongoose.Schema({
  application: { type: mongoose.Schema.Types.ObjectId, ref: "FiltrationApplication", required: true, index: true },
  answers: [{ questionId: mongoose.Schema.Types.ObjectId, response: String }],
  score: { type: Number, min: 0, max: 100 }, submittedAt: { type: Date, default: Date.now },
  proctoringFlags: [String], justification: String,
  attemptNumber: { type: Number, min: 1, required: true },
}, { timestamps: true, collection: "filtration_test_submissions" });
schema.index({ application: 1, attemptNumber: 1 }, { unique: true });
module.exports = mongoose.model("FiltrationTestSubmission", schema);
