const mongoose = require("mongoose");
const questionSchema = new mongoose.Schema({
  prompt: { type: String, required: true }, options: [String], correctAnswer: String,
  taskSpec: String, rubric: [String],
});
const schema = new mongoose.Schema({
  job: { type: mongoose.Schema.Types.ObjectId, ref: "FiltrationJob", required: true, index: true },
  type: { type: String, enum: ["mcq", "task"], required: true },
  timeLimitMinutes: { type: Number, min: 1, required: true },
  proctoringEnabled: { type: Boolean, default: false },
  maxAttempts: { type: Number, min: 1, max: 5, default: 1 },
  questions: { type: [questionSchema], validate: (value) => value.length > 0 },
}, { timestamps: true, collection: "filtration_tests" });
module.exports = mongoose.model("FiltrationTest", schema);
