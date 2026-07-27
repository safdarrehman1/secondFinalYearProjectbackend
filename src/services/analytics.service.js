const User = require("../models/user.model");
const Order = require("../models/order.model");
const FiltrationJob = require("../modules/job-filtration/filtration-job.model");
const FiltrationApplication = require("../modules/job-filtration/filtration-application.model");
const Job = require("../models/job.model");
const AppliedJobs = require("../models/appliedJobs.model");
const Application = require("../models/application.model");
const Report = require("../models/report.model");
const ContactUs = require("../models/contactUs.model");
const Gig = require("../models/gig.model");
const Purchase = require("../models/purchase.model");

const groupCounts = async (Model, field, match = {}) => {
  const rows = await Model.aggregate([
    { $match: match },
    { $group: { _id: `$${field}`, count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);
  return Object.fromEntries(rows.map((row) => [row._id || "unknown", row.count]));
};

const mergeCounts = (...groups) => groups.reduce((result, group) => {
  Object.entries(group).forEach(([key, value]) => { result[key] = (result[key] || 0) + value; });
  return result;
}, {});

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
    legacyJobs,
    proposalApplications,
    fulltimeApplications,
    legacyJobsByStatus,
    proposalApplicationsByStatus,
    fulltimeApplicationsByStatus,
    reports,
    supportRequests,
    gigs,
    purchases,
  ] = await Promise.all([
    User.countDocuments(dateMatch),
    FiltrationJob.countDocuments(dateMatch),
    FiltrationApplication.countDocuments(dateMatch),
    Order.countDocuments(dateMatch),
    groupCounts(FiltrationJob, "status", dateMatch),
    groupCounts(FiltrationJob, "type", dateMatch),
    groupCounts(FiltrationApplication, "finalStatus", dateMatch),
    groupCounts(Order, "status", dateMatch),
    Job.countDocuments(dateMatch),
    AppliedJobs.countDocuments(dateMatch),
    Application.countDocuments(dateMatch),
    groupCounts(Job, "status", dateMatch),
    groupCounts(AppliedJobs, "screeningStatus", dateMatch),
    groupCounts(Application, "status", dateMatch),
    Report.countDocuments(dateMatch),
    ContactUs.countDocuments(dateMatch),
    Gig.countDocuments(dateMatch),
    Purchase.countDocuments(dateMatch),
  ]);

  const allJobsByStatus = mergeCounts(jobsByStatus, legacyJobsByStatus);
  const allApplicationsByStatus = mergeCounts(applicationsByStatus, proposalApplicationsByStatus, fulltimeApplicationsByStatus);
  const totalJobs = jobs + legacyJobs;
  const totalApplications = applications + proposalApplications + fulltimeApplications;

  const hired = allApplicationsByStatus.hired || 0;
  const rejected = allApplicationsByStatus.rejected || 0;
  const completedOrders = ordersByStatus.complete || 0;
  return {
    totals: { users, jobs: totalJobs, applications: totalApplications, orders, reports, supportRequests, gigs, purchases },
    jobsByStatus: allJobsByStatus,
    jobsByType,
    applicationsByStatus: allApplicationsByStatus,
    ordersByStatus,
    conversion: {
      applicationToHirePct: totalApplications
        ? Number(((hired / totalApplications) * 100).toFixed(2))
        : 0,
      screenedDecisionPct: totalApplications
        ? Number((((hired + rejected) / totalApplications) * 100).toFixed(2))
        : 0,
      orderCompletionPct: orders
        ? Number(((completedOrders / orders) * 100).toFixed(2))
        : 0,
    },
  };
};

module.exports = { getAdminOverview };
