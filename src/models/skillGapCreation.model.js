const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

const skillGapCreationSchema = mongoose.Schema({
  workType: { type: String, default: 'design' },
  title: { type: String, required: true, trim: true },
  category: { type: String, required: true, trim: true },
  subcategory: { type: String, required: true, trim: true },
  description: { type: String, required: true, trim: true },
  workImages: { type: [String], default: [] },
  tags: { type: [String], default: [] },
  softwareTool: { type: [String], default: [] },
  embeds: { type: String, default: '' },
  likes: { type: [mongoose.Schema.Types.Mixed], default: [] },
  totalCollect: { type: Number, default: 0 },
  views: { type: Number, default: 0 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
}, { timestamps: true });

skillGapCreationSchema.plugin(toJSON);
skillGapCreationSchema.plugin(paginate);

module.exports = mongoose.model('SkillGapCreation', skillGapCreationSchema);
