const Report = require("../models/report.model");
const {
  User,
  Job,
  Blog,
  Gig,
} = require("../models");

const populateReportData = async (reports) => {
  const populatedReports = await Promise.all(
    reports.map(async (report) => {
      const reportObj = report.toObject();
      let reportedItem = null;

      try {
        switch (report.type) {
          case "user":
            reportedItem = await User.findById(report.reportedId).select(
              "name email",
            );
            break;
          case "job":
            reportedItem = await Job.findById(report.reportedId).select(
              "projectTitle",
            );
            break;
          case "blog":
            reportedItem = await Blog.findById(report.reportedId).select(
              "title",
            );
            break;
          case "gig":
            reportedItem = await Gig.findById(report.reportedId).select(
              "title",
            );
            break;
          case "comment":
            // For comment, it's complex because we don't know which model it belongs to here
            // We might just show "Comment" for now or find a way to track parentId
            reportedItem = { title: "Comment Content" };
            break;
          default:
            reportedItem = null;
        }
      } catch (err) {
        console.error(`Error populating report ${report._id}:`, err);
      }

      if (reportedItem) {
        reportObj.reportedId = reportedItem;
        // Map common fields to a unified 'name' or 'title' for display
        reportObj.reportedItemName =
          reportedItem.name ||
          reportedItem.title ||
          reportedItem.projectTitle ||
          "Unknown Item";
      }

      return reportObj;
    }),
  );
  return populatedReports;
};

const getAllReports = async () => {
  const reports = await Report.find({})
    .populate("userId", "name email")
    .populate("reportedUserId", "name email")
    .sort({ createdAt: -1 });

  return populateReportData(reports);
};

const deleteReports = async (ids) => {
  return Report.deleteMany({ _id: { $in: ids } });
};

const createReport = async ({
  userId,
  type,
  reportedId,
  reportedUserId,
  reason,
  description,
}) => {
  return Report.create({
    userId,
    type,
    reportedId,
    reportedUserId,
    reason,
    description,
  });
};

const findReport = async ({ userId, type, reportedId }) => {
  return Report.findOne({ userId, type, reportedId });
};

const getReportsByIds = async (ids) => {
  const reports = await Report.find({ _id: { $in: ids } })
    .populate("userId", "name email")
    .populate("reportedUserId", "name email");

  return populateReportData(reports);
};

const countReports = async (filter) => {
  return Report.countDocuments(filter);
};

module.exports = {
  getAllReports,
  deleteReports,
  createReport,
  findReport,
  getReportsByIds,
  countReports,
};
