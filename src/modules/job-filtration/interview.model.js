const mongoose = require("mongoose");
const schema = new mongoose.Schema({
  application: { type: mongoose.Schema.Types.ObjectId, ref: "FiltrationApplication", required: true, index: true },
  job: { type: mongoose.Schema.Types.ObjectId, ref: "FiltrationJob", required: true, index: true },
  poster: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  candidate: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  status: { type: String, enum: ["proposed", "confirmed", "reschedule_requested", "completed", "cancelled"], default: "proposed", index: true },
  startsAt: { type: Date, required: true, index: true }, endsAt: { type: Date, required: true },
  timezone: { type: String, required: true }, meetingLink: String,
  rescheduleNote: String, cancellationReason: String,
  privateNotes: { type: String, select: false },
  scorecard: [{ category: String, score: { type: Number, min: 1, max: 5 }, note: String }],
  history: [{ from: String, to: String, changedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, reason: String, changedAt: { type: Date, default: Date.now } }],
}, { timestamps: true, collection: "filtration_interviews" });
schema.index({ candidate: 1, startsAt: 1, endsAt: 1 });
schema.index({ poster: 1, startsAt: 1, endsAt: 1 });
module.exports = mongoose.model("FiltrationInterview", schema);
