const mongoose = require('mongoose');
const { toJSON } = require('./plugins');

const hiringAssetSchema = mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    category: { type: String, required: true, trim: true },
    subcategory: { type: String, default: '', trim: true },
    description: { type: String, required: true },
    isFree: { type: Boolean, default: false },
    personalLicensePrice: { type: Number, default: 0 },
    commercialLicensePrice: { type: Number, default: 0 },
    extendedCommercialPrice: { type: Number, default: 0 },
    gameEnginePrice: { type: Number, default: 0 },
    broadcastFilmPrice: { type: Number, default: 0 },
    extendedRedistributionPrice: { type: Number, default: 0 },
    educationPrice: { type: Number, default: 0 },
    assetImages: { type: [String], default: [] },
    embeds: { type: String, default: '' },
    uploadAsset: { type: mongoose.Schema.Types.Mixed, required: true },
    fileSize: { type: Number, default: 0 },
    tags: { type: [String], default: [] },
    softwareTools: { type: [String], default: [] },
    status: {
      type: String,
      enum: ['draft', 'published', 'archived'],
      default: 'published',
    },
    basicParametersText: { type: String, default: '' },
    classificationParametersText: { type: String, default: '' },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
  },
  { timestamps: true, strict: false },
);

hiringAssetSchema.plugin(toJSON);

module.exports = mongoose.model('HiringAsset', hiringAssetSchema);
