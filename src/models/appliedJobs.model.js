const mongoose = require('mongoose');
const validator = require('validator');
const bcrypt = require('bcryptjs');
const { toJSON, paginate } = require('./plugins');
const { roles } = require('../config/roles');
const { ObjectId } = require('mongodb');

const appliedJobSchema = mongoose.Schema(
  {
    message: {
      type: String,
      required: true,
    },
    jobId: {
      type: ObjectId,
      ref: 'Job',
      required: true,
    },
    createdBy: {
      type: ObjectId,
      ref: 'User',
      required: true,
    },
    resumeMatchScore: {
      type: Number,
      required: true,
    },
    resumeMatchSuggestion: {
      type: String,
      required: true,
    },
    missingSkills: {
      type: [String],
      default: [],
    },
    matchScore: { type: Number, min: 0, max: 100, default: null },
    parsedSkills: { type: [String], default: undefined },
    parsedAbout: { type: String, default: null },
    parsedProjects: { type: [mongoose.Schema.Types.Mixed], default: undefined },
    flaggedProjects: { type: [mongoose.Schema.Types.Mixed], default: undefined },
    resumeFile: { type: mongoose.Schema.Types.Mixed, default: null },
    questionnaireScore: { type: Number, min: 0, max: 100, default: null },
    disqualifiedReason: { type: String, default: null },
    qualified: { type: Boolean, default: false, index: true },
    screeningStatus: {
      type: String,
      enum: ['manual_review', 'test_pending', 'test_submitted', 'disqualified'],
      default: 'manual_review',
    },
  },
  {
    timestamps: true,
  }
);

// add plugin that converts mongoose to json
appliedJobSchema.plugin(toJSON);
appliedJobSchema.plugin(paginate);

/**
 * @typedef Job
 */
const AppliedJobs = mongoose.model('AppliedJobs', appliedJobSchema);

module.exports = AppliedJobs;
