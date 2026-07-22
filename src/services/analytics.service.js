const User = require("../models/user.model");
const Order = require("../models/order.model");
const FiltrationJob = require("../modules/job-filtration/filtration-job.model");
const FiltrationApplication = require("../modules/job-filtration/filtration-application.model");

const groupCounts = async (Model, field, match = {}) => {
  const rows = await Model.aggregate([
    { $match: match },
    { $group: { _id: `$${field}`, count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);
  return Object.fromEntries(rows.map((row) => [row._id || "unknown", row.count]));
};

const getAdminOverview = async ({ from, to } = {}) => {
  const createdAt = {};
  if (from) createdAt.$gte = new Date(from);
  if (to) createdAt.$lte = new Date(to);
  const dateMatch = Object.keys(createdAt).length ? { createdAt } : {};

  const [
    users,
    jobs,
    applications,
    orders,
    jobsByStatus,
    jobsByType,
    applicationsByStatus,
    ordersByStatus,
  ] = await Promise.all([
    User.countDocuments(dateMatch),
    FiltrationJob.countDocuments(dateMatch),
    FiltrationApplication.countDocuments(dateMatch),
    Order.countDocuments(dateMatch),
    groupCounts(FiltrationJob, "status", dateMatch),
    groupCounts(FiltrationJob, "type", dateMatch),
    groupCounts(FiltrationApplication, "finalStatus", dateMatch),
    groupCounts(Order, "status", dateMatch),
  ]);

  const hired = applicationsByStatus.hired || 0;
  const rejected = applicationsByStatus.rejected || 0;
  const completedOrders = ordersByStatus.complete || 0;
  return {
    totals: { users, jobs, applications, orders },
    jobsByStatus,
    jobsByType,
    applicationsByStatus,
    ordersByStatus,
    conversion: {
      applicationToHirePct: applications
        ? Number(((hired / applications) * 100).toFixed(2))
        : 0,
      screenedDecisionPct: applications
        ? Number((((hired + rejected) / applications) * 100).toFixed(2))
        : 0,
      orderCompletionPct: orders
        ? Number(((completedOrders / orders) * 100).toFixed(2))
        : 0,
    },
  };
};

module.exports = { getAdminOverview };
