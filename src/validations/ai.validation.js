const Joi = require('joi');

const generateAutofill = {
  body: Joi.object().keys({
    title: Joi.string().required().min(3).max(200).messages({
      'string.empty': 'Title is required',
      'string.min': 'Title must be at least 3 characters',
      'string.max': 'Title cannot exceed 200 characters',
      'any.required': 'Title is required (minimum 3 characters)',
    }),
    category: Joi.string().max(100).optional().allow(''),
    subcategory: Joi.string().max(100).optional().allow(''),
    workImages: Joi.array().items(Joi.string().uri()).max(10).optional(),
    contextHint: Joi.string().optional().allow(''),
  }),
};

const generateResumeMatch = {
  body: Joi.object().keys({
    jobId: Joi.string().required(),
    previousResume: Joi.string().max(50000).optional().allow(''),
    previousAnalysis: Joi.alternatives().try(Joi.object(), Joi.string()).optional(),
    threshold: Joi.number().integer().min(0).max(100).default(75),
  }),
};

const generateApplicationMessage = {
  body: Joi.object().keys({
    jobId: Joi.string().required(),
    score: Joi.number().integer().min(0).max(100).required(),
    missingSkills: Joi.array().items(Joi.string()).max(8).default([]),
    recipientName: Joi.string().max(100).optional().allow(''),
    parsedSkills: Joi.array().items(Joi.string().max(100)).max(50).default([]),
    parsedAbout: Joi.string().max(3000).optional().allow(''),
  }),
};

const generateProfileAbout = {
  body: Joi.object().keys({
    isCompany: Joi.boolean().optional().default(false),
    companyName: Joi.string().max(200).optional().allow(''),
    industry: Joi.string().max(200).optional().allow(''),
    occupations: Joi.array().items(Joi.string()).max(20).default([]),
    softwareTools: Joi.array().items(Joi.string()).max(20).default([]),
    currentAbout: Joi.string().max(3000).optional().allow(''),
  }),
};

const generateJobDescription = {
  body: Joi.object().keys({
    prompt: Joi.string().min(10).max(2000).required(),
    jobTitle: Joi.string().max(200).optional().allow(''),
    category: Joi.string().max(100).optional().allow(''),
  }),
};

const fillDeliveryTemplate = {
  body: Joi.object().keys({
    title: Joi.string().max(200).optional().allow(''),
    category: Joi.string().min(2).max(100).required(),
    subcategory: Joi.string().max(200).optional().allow(''),
    template: Joi.string().min(10).max(5000).required(),
    contextHint: Joi.string().max(2000).optional().allow(''),
  }),
};

module.exports = {
  generateAutofill,
  generateResumeMatch,
  generateApplicationMessage,
  generateProfileAbout,
  generateJobDescription,
  fillDeliveryTemplate,
};
