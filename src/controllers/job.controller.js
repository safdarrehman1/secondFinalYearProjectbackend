const httpStatus = require("http-status");
const pick = require("../utils/pick");
const regexFilter = require("../utils/regexFilter");
const ApiError = require("../utils/ApiError");
const catchAsync = require("../utils/catchAsync");
const { jobService } = require("../services");
const { Job } = require("../models");
const chatController = require("./chat.controller");
const User = require("../models/user.model");
const ChatService = require("../services/chat.service");
const UserSpace = require("../models/userSpace.model");
const reportService = require("../services/report.service");
const { verifyResumeAnalysisToken } = require("./ai.controller");
const screeningService = require("../modules/applicant-screening/screening.service");

const validateManualQuestions = (questionSource, customQuestions) => {
  if (questionSource === "manual") {
    if (!Array.isArray(customQuestions) || customQuestions.length === 0) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Manual question mode requires at least one custom question.");
    }
    for (const q of customQuestions) {
      if (!q.questionText || !q.questionText.trim()) {
        throw new ApiError(httpStatus.BAD_REQUEST, "Each custom question must have valid question text.");
      }
      if ((!q.type || q.type === "mcq") && (!Array.isArray(q.options) || q.options.length < 2 || !q.correctAnswer)) {
        throw new ApiError(httpStatus.BAD_REQUEST, "Each multiple-choice question must have at least 2 options and a correct answer.");
      }
    }
  }
};

const postJob = catchAsync(async (req, res) => {
  const avatarPath = req.body.applicantAvatar || null;
  const backgroundImagePath = req.body.applicantBackgroundImage || null;

  validateManualQuestions(req.body.questionSource, req.body.customQuestions);

  const createdBy = req.user.id;

  const payload = {
    ...req.body,
    createdBy,
    avatar: avatarPath,
    backgroundImage: backgroundImagePath,
    createdOn: new Date(),
  };

  const job = await jobService.postJob(payload);
  res.status(httpStatus.CREATED).send(job);
});

const getJobs = catchAsync(async (req, res) => {
  const likeFilter = regexFilter(req.query, ["projectTitle"]);
  const pickFilter = pick(req.query, ["preferredLocation", "category"]);

  const categoryFilter = Array.isArray(pickFilter.category)
    ? pickFilter.category
    : [];

  const filter = {
    ...likeFilter,
    ...pickFilter,
    category: categoryFilter.length > 0 ? { $in: categoryFilter } : undefined,
  };

  const options = pick(req.query, ["sortBy", "limit", "page"]);
  const result = await jobService.queryJobs(filter, options);
  res.send(result);
});

const saveJob = catchAsync(async (req, res) => {
  const { jobId } = req.params;
  const job = await Job.findById(jobId);
  if (!job) {
    throw new ApiError(httpStatus.NOT_FOUND, "Job not found");
  }

  const userId = String(req.user.id);
  const savedBy = (job.savedBy || []).map(String);
  const isSaved = savedBy.includes(userId);
  job.savedBy = isSaved
    ? savedBy.filter((id) => id !== userId)
    : [...savedBy, userId];
  await job.save();

  res.send({ success: true, data: { jobId: job.id, isSaved: !isSaved } });
});

const getSavedJobs = catchAsync(async (req, res) => {
  const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(
    Math.max(Number.parseInt(req.query.limit, 10) || 12, 1),
    50,
  );
  const filter = { savedBy: String(req.user.id) };
  const [jobs, total] = await Promise.all([
    Job.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Job.countDocuments(filter),
  ]);

  res.send({
    success: true,
    data: jobs,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

const getMyJobs = catchAsync(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;

  const result = await jobService.getMyJobs(req.user.id, page, limit);

  res.status(200).send(result);
});

const getMyJobs2 = catchAsync(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;

  const result = await jobService.getMyJobs2(req.user.id, page, limit);

  res.status(200).send(result);
});

const changeJobStatus = catchAsync(async (req, res) => {
  const { jobId } = req.params;
  const { status } = req.body;

  const validStatuses = ["active", "inactive", "inreview"];
  if (!validStatuses.includes(status)) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid status");
  }

  const updatedJob = await jobService.changeJobStatus(jobId, status);
  res.send(updatedJob);
});

const getJob = catchAsync(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;

  const result = await jobService.getJobs(page, limit);
  res.set("Cache-Control", "public, max-age=30, stale-while-revalidate=300");
  res.send(result);
});

const getJobsAdmin = catchAsync(async (req, res) => {
  const jobs = await Job.find({}).sort({ createdAt: -1 }).lean();
  res.status(httpStatus.OK).send({ success: true, data: jobs });
});

const changeJobStatusAdmin = catchAsync(async (req, res) => {
  const validStatuses = ["active", "inactive", "inreview"];
  if (!validStatuses.includes(req.body.status)) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid job status");
  }
  const job = await Job.findByIdAndUpdate(req.params.jobId, { status: req.body.status }, { new: true, runValidators: true });
  if (!job) throw new ApiError(httpStatus.NOT_FOUND, "Job not found");
  res.status(httpStatus.OK).send({ success: true, data: job });
});

const deleteJobAdmin = catchAsync(async (req, res) => {
  const job = await Job.findByIdAndDelete(req.params.jobId);
  if (!job) throw new ApiError(httpStatus.NOT_FOUND, "Job not found");
  res.status(httpStatus.OK).send({ success: true, message: "Job deleted successfully" });
});

const getJobById = catchAsync(async (req, res) => {
  const job = await jobService.getJobById(req.params.jobId);
  if (!job) {
    throw new ApiError(httpStatus.NOT_FOUND, "Job not found");
  }
  res.send(job);
});

const applyJob = catchAsync(async (req, res) => {
  const targetJob = await Job.findById(req.body.applyJob.jobId);
  if (!targetJob) {
    throw new ApiError(httpStatus.NOT_FOUND, "Job not found");
  }
  const expiryTime = targetJob.expiresAt
    ? new Date(targetJob.expiresAt).getTime()
    : targetJob.createdAt && targetJob.activePeriod
      ? new Date(targetJob.createdAt).getTime() +
        targetJob.activePeriod * 24 * 60 * 60 * 1000
      : null;
  const hasStartedOrEnded =
    targetJob.orderTracking &&
    targetJob.orderTracking.status !== "not_started";

  if (
    targetJob.status !== "active" ||
    hasStartedOrEnded ||
    (expiryTime && Date.now() >= expiryTime)
  ) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "This job is no longer accepting applications.",
    );
  }

  let resumeAnalysis;
  let questionnaireId = null;
  try {
    resumeAnalysis = verifyResumeAnalysisToken(
      req.body.applyJob.resumeAnalysisToken,
      req.user.id,
      req.body.applyJob.jobId,
    );
  } catch (_) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      "Your resume must receive an AI match score above 60% before you can apply.",
    );
  }

  const payload = {
    ...req.body.applyJob,
    resumeMatchScore: resumeAnalysis.score,
    resumeMatchSuggestion: resumeAnalysis.suggestion,
    missingSkills: resumeAnalysis.missingSkills,
    matchScore: resumeAnalysis.screening?.matchScore ?? resumeAnalysis.score,
    parsedSkills: resumeAnalysis.screening?.skills,
    parsedAbout: resumeAnalysis.screening?.aboutSummary,
    parsedProjects: resumeAnalysis.screening?.projects,
    flaggedProjects: resumeAnalysis.screening?.flaggedProjects,
    resumeFile: resumeAnalysis.resumeFile,
    createdBy: req.user.id,
  };
  delete payload.resumeAnalysisToken;

  const existingApplication = await jobService.getApplicationByJobIdAndUserId(
    req.body.applyJob.jobId,
    req.user.id,
  );

  if (existingApplication) {
    return res.status(httpStatus.CONFLICT).send({
      message: "You already applied to this job",
    });
  }

  const appliedJob = await jobService.applyJob(payload);

  try {
    const job = await Job.findById(payload.jobId).lean();
    const questionnaire = await screeningService.generateQuestionnaire(appliedJob, job);
    questionnaireId = questionnaire._id;
    appliedJob.screeningStatus = "test_pending";
    await appliedJob.save();
    appliedJob.set("questionnaireId", questionnaire._id, { strict: false });
  } catch (error) {
    console.warn(`Questionnaire generation failed; application remains in manual review: ${error.message}`);
  }

  res.status(httpStatus.CREATED).send({
    ...appliedJob.toObject(),
    questionnaireId,
    testRequired: true,
    testPath: `/applications/${appliedJob._id}/test`,
  });
});

const getAppliedJobs = catchAsync(async (req, res) => {
  const result = await jobService.getAppliedJobs(req.user.id);
  res.status(httpStatus.OK).send(result);
});

const deleteJob = catchAsync(async (req, res) => {
  const { jobId } = req.params;
  const job = await jobService.getJobById(jobId);

  if (!job) {
    throw new ApiError(httpStatus.NOT_FOUND, "Job not found");
  }

  await jobService.deleteJob(jobId);

  res.status(httpStatus.OK).send({ message: "Job deleted successfully" });
});

const updateJob = catchAsync(async (req, res) => {
  const { jobId } = req.params;
  const job = await jobService.getJobById(jobId);

  if (!job) {
    throw new ApiError(httpStatus.NOT_FOUND, "Job not found");
  }

  validateManualQuestions(req.body.questionSource, req.body.customQuestions);

  const userId = req.user.id.toString();
  let savedByArr = (job.savedBy || []).map((id) => id.toString());

  if (req.body.savedBy !== undefined) {
    savedByArr = req.body.savedBy;
  }

  const updateData = { ...req.body, savedBy: savedByArr };
  const updatedJob = await jobService.updateJob(jobId, updateData);

  res
    .status(httpStatus.OK)
    .send({ message: "Job updated successfully", job: updatedJob });
});

const reportJob = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { reason, description } = req.body;

  const job = await Job.findById(id);
  if (!job) {
    return res.status(httpStatus.NOT_FOUND).json({ message: "Job not found" });
  }

  const existingReport = await reportService.findReport({
    userId: req.user.id,
    type: "job",
    reportedId: id,
  });
  if (existingReport) {
    return res
      .status(httpStatus.BAD_REQUEST)
      .json({ message: "You have already reported this job." });
  }

  await reportService.createReport({
    userId: req.user.id,
    type: "job",
    reportedId: id,
    reportedUserId: job.createdBy,
    reason: reason || "",
    description: description || "",
  });

  res
    .status(httpStatus.CREATED)
    .json({ message: "Report submitted successfully" });
});

const getJobWithApplicants = catchAsync(async (req, res) => {
  const { jobId } = req.params;
  const result = await jobService.getJobWithApplicants(jobId);
  res.status(httpStatus.OK).send(result);
});

const extendJob = catchAsync(async (req, res) => {
  const { jobId } = req.params;
  const { type, paymentId } = req.body;

  const job = await jobService.extendJob(jobId, type, paymentId);
  res.send(job);
});

module.exports = {
  postJob,
  getJobs,
  getJobById,
  applyJob,
  deleteJob,
  updateJob,
  getJob,
  getJobsAdmin,
  changeJobStatusAdmin,
  deleteJobAdmin,
  saveJob,
  getSavedJobs,
  getMyJobs,
  getMyJobs2,
  changeJobStatus,
  getAppliedJobs,
  reportJob,
  getJobWithApplicants,
  extendJob,
};
