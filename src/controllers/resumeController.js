const httpStatus = require("http-status");
const catchAsync = require("../utils/catchAsync");
const ApiError = require("../utils/ApiError");
const pick = require("../utils/pick");
const { Resume } = require("../models");
const resumeTemplates = require("../config/resumeTemplates");
const resumeService = require("../services/resumeService");

const listTemplates = catchAsync(async (req, res) => {
  res.status(httpStatus.OK).json({
    success: true,
    data: resumeTemplates,
  });
});

const createResume = catchAsync(async (req, res) => {
  const resume = await Resume.create({
    user: req.user.id,
    ...req.body,
  });

  res.status(httpStatus.CREATED).json({
    success: true,
    data: resume,
  });
});

const getResume = catchAsync(async (req, res) => {
  const resume = await Resume.findOne({
    _id: req.params.resumeId,
    user: req.user.id,
  });

  if (!resume) {
    throw new ApiError(httpStatus.NOT_FOUND, "Resume not found");
  }

  res.status(httpStatus.OK).json({
    success: true,
    data: resume,
  });
});

const updateResume = catchAsync(async (req, res) => {
  const resume = await Resume.findOneAndUpdate(
    { _id: req.params.resumeId, user: req.user.id },
    req.body,
    { new: true, runValidators: true }
  );

  if (!resume) {
    throw new ApiError(httpStatus.NOT_FOUND, "Resume not found");
  }

  res.status(httpStatus.OK).json({
    success: true,
    data: resume,
  });
});

const deleteResume = catchAsync(async (req, res) => {
  const resume = await Resume.findOneAndDelete({
    _id: req.params.resumeId,
    user: req.user.id,
  });

  if (!resume) {
    throw new ApiError(httpStatus.NOT_FOUND, "Resume not found");
  }

  res.status(httpStatus.OK).json({
    success: true,
    message: "Resume deleted successfully",
  });
});

const listUserResumes = catchAsync(async (req, res) => {
  const filter = { user: req.user.id };
  const options = pick(req.query, ["sortBy", "limit", "page"]);

  // Ensure default page & limit
  if (!options.limit) options.limit = 10;
  if (!options.page) options.page = 1;
  if (!options.sortBy) options.sortBy = "updatedAt:desc";

  const result = await Resume.paginate(filter, options);

  res.status(httpStatus.OK).json({
    success: true,
    data: result,
  });
});

const exportResumePdf = catchAsync(async (req, res) => {
  const resume = await Resume.findOne({
    _id: req.params.resumeId,
    user: req.user.id,
  });

  if (!resume) {
    throw new ApiError(httpStatus.NOT_FOUND, "Resume not found");
  }

  // Trigger service PDF generation
  const pdfUrl = await resumeService.renderResumeToPdf(resume);

  resume.exportedPdfUrl = pdfUrl;
  await resume.save();

  res.status(httpStatus.OK).json({
    success: true,
    data: {
      url: pdfUrl,
    },
  });
});

const chatAssist = catchAsync(async (req, res) => {
  const { prompt, sectionType, existingContent, title } = req.body;

  if (!prompt) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Prompt is required");
  }

  const generatedText = await resumeService.generateSectionContent(prompt, {
    sectionType: sectionType || "Summary",
    existingContent: existingContent || "",
    title: title || "",
    userId: req.user?.id,
  });

  res.status(httpStatus.OK).json({
    success: true,
    data: {
      text: generatedText,
    },
  });
});

module.exports = {
  listTemplates,
  createResume,
  getResume,
  updateResume,
  deleteResume,
  listUserResumes,
  exportResumePdf,
  chatAssist,
};
