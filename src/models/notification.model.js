const mongoose = require("mongoose");
const { toJSON, paginate } = require("./plugins");

const notificationSchema = mongoose.Schema(
  {
    type: {
      type: String,
      required: true,
      enum: [
        "extra_payment_requested",
        "extra_payment_decided",
        "extra_payment_paid",
        "order_status_update",
        "order_created",
        "order_accepted",
        "order_declined",
        "order_delivered",
        "delivery_accepted",
        "delivery_revision",
        "order_completed",
        "order_cancelled",
        "cancellation_requested",
        "cancellation_accepted",
        "cancellation_declined",
        "extension_requested",
        "extension_accepted",
        "extension_declined",
        "order_message",
        "order_review",
        "review_reply",
        "support_requested",
      ],
    },
    receiver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    data: {
      type: Object, // Flexible field to store related IDs (orderId, etc.)
      default: {},
    },
    isRead: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);

// add plugin that converts mongoose to json
notificationSchema.plugin(toJSON);
notificationSchema.plugin(paginate);

/**
 * @typedef Notification
 */
const Notification = mongoose.model("Notification", notificationSchema);

module.exports = Notification;
