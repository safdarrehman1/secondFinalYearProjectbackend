const mongoose = require("mongoose");
const { toJSON, paginate } = require("./plugins");

const saleSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["project", "sponsor"],
      default: "project",
    },
    assetId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Job",
      required: false,
    },
    OwnerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    buyerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    buyer: {
      type: String,
      required: true,
    },
    creatorName: {
      type: String,
      required: true,
    },
    assetTitle: {
      type: String,
      required: true,
    },
    assetPrice: {
      type: Number,
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
    },
    totalAmount: {
      type: Number,
      required: true,
    },
    paymentMethod: {
      type: String,
      enum: ["paypal", "stripe", "card"],
      default: "paypal",
    },
    paymentId: {
      type: String,
      required: false,
    },
    status: {
      type: String,
      enum: ["pending", "completed", "failed", "refunded"],
      default: "completed",
    },
    created_at: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true },
);

// add plugin that converts mongoose to json
saleSchema.plugin(toJSON);
saleSchema.plugin(paginate);

/**
 * @typedef Sale
 */
const Sale = mongoose.model("Sale", saleSchema);

module.exports = Sale;
