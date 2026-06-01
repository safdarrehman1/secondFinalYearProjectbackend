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
