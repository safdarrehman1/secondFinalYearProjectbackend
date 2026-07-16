const mongoose = require('mongoose');

const questionnaireSchema = mongoose.Schema({
  applicationId: { type: mongoose.Schema.Types.ObjectId, ref: 'AppliedJobs', required: true, unique: true, index: true },
  questions: { type: [mongoose.Schema.Types.Mixed], required: true },
}, { timestamps: true });

module.exports = mongoose.model('Questionnaire', questionnaireSchema);
