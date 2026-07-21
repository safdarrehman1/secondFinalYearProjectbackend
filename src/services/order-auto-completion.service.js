const Order = require("../models/order.model");
const orderService = require("./order.service");

const completeEligibleOrders = async (now = new Date()) => {
  const eligibleOrders = await Order.find({
    status: "delivered",
    autoCompleteAt: { $ne: null, $lte: now },
    "requestSupport.status": { $ne: "pending" },
  }).select("_id recruiterId");

  const results = { completed: 0, failed: 0 };
  for (const order of eligibleOrders) {
    try {
      await orderService.updateOrderStatus(
        order._id,
        "complete",
        "Delivery automatically accepted after the review period",
        order.recruiterId,
        "delivery_auto_completed",
      );
      results.completed += 1;
    } catch (error) {
      results.failed += 1;
      console.error(`Failed to auto-complete order ${order._id}:`, error);
    }
  }

  return results;
};

module.exports = { completeEligibleOrders };
