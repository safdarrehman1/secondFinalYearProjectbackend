const httpStatus = require("http-status");
const catchAsync = require("../utils/catchAsync");
const reportService = require("../services/report.service");
const { blogService } = require("../services");
const pick = require("../utils/pick");

const createBlogReport = catchAsync(async (req, res) => {
  const { blogId } = req.params;
  const { reason, description } = req.body;

  // Check if blog exists
  const blog = await blogService.getBlogById(blogId);
  if (!blog) {
    return res.status(httpStatus.NOT_FOUND).json({
      success: false,
      message: "Blog not found",
    });
  }

  // Check if user already reported this blog
  const existingReport = await reportService.findReport({
    userId: req.user.id,
    type: "blog",
    reportedId: blogId,
  });

  if (existingReport) {
    return res.status(httpStatus.BAD_REQUEST).json({
      success: false,
      message: "You have already reported this blog",
    });
  }

  const reportData = {
    userId: req.user.id,
    type: "blog",
    reportedId: blogId,
    reportedUserId: blog.createdBy,
    reason: reason || "",
    description: description || "",
  };

  const report = await reportService.createReport(reportData);
  res.status(httpStatus.CREATED).json({
    success: true,
    message: "Blog report created successfully",
    data: report,
  });
});


const getReports = catchAsync(async (req, res) => {
  const reports = await reportService.getAllReports();
  res.json({
    success: true,
    message: "Reports retrieved successfully",
    data: reports,
  });
});

const { deleteReportsAdmin } = require("./user.controller");

// Gunakan handler admin untuk delete report
const deleteReport = deleteReportsAdmin;

const dismissReport = catchAsync(async (req, res) => {
  const result = await reportService.deleteReports([req.params.reportId]);
  if (!result.deletedCount) return res.status(httpStatus.NOT_FOUND).json({ success: false, message: "Report not found" });
  return res.status(httpStatus.OK).json({ success: true, message: "Report dismissed" });
});

module.exports = {
  createBlogReport,
  getReports,
  deleteReport,
  dismissReport,
};
