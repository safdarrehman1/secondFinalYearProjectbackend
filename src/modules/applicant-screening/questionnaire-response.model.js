const mongoose = require('mongoose');

const responseSchema = mongoose.Schema({
  questionnaireId: { type: mongoose.Schema.Types.ObjectId, ref: 'Questionnaire', required: true, unique: true, index: true },
  answers: { type: [mongoose.Schema.Types.Mixed], default: [] },
  score: { type: Number, min: 0, max: 100, required: true },
  submittedAt: { type: Date, default: Date.now },
}, { timestamps: true });

module.exports = mongoose.model('QuestionnaireResponse', responseSchema);
