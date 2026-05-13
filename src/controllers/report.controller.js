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

const {
  ShareMusicAsset,
  Music,
  LyricsMusic,
  ShareMusicCreation,
} = require("../models");

const createCommentReport = catchAsync(async (req, res) => {
  const { commentId } = req.params;
  const { reason, description, musicId } = req.body;

  // Find the comment and its owner across models
  let data = await Music.findById(musicId);
  if (!data) data = await LyricsMusic.findById(musicId);
  if (!data) data = await ShareMusicAsset.findById(musicId);
  if (!data) data = await ShareMusicCreation.findById(musicId);

  if (!data) {
    return res.status(httpStatus.NOT_FOUND).json({
      success: false,
      message: "Music item not found",
    });
  }

  const comment = data.comments.find((c) => c._id.toString() === commentId);
  if (!comment) {
    return res.status(httpStatus.NOT_FOUND).json({
      success: false,
      message: "Comment not found",
    });
  }

  // Check if user already reported this comment
  const existingReport = await reportService.findReport({
    userId: req.user.id,
    type: "comment",
    reportedId: commentId,
  });

  if (existingReport) {
    return res.status(httpStatus.BAD_REQUEST).json({
      success: false,
      message: "You have already reported this comment",
    });
  }

  const reportData = {
    userId: req.user.id,
    type: "comment",
    reportedId: commentId,
    reportedUserId: comment.userId,
    reason: reason || "",
    description: description || "",
  };

  const report = await reportService.createReport(reportData);
  res.status(httpStatus.CREATED).json({
    success: true,
    message: "Comment report created successfully",
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

module.exports = {
  createBlogReport,
  createCommentReport,
  getReports,
  deleteReport,
};
