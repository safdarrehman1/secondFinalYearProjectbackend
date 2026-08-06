const httpStatus = require("http-status");
const ApiError = require("../utils/ApiError");
const catchAsync = require("../utils/catchAsync");
const pick = require("../utils/pick");
const { Job, Application, User, Notification } = require("../models");
const applicationService = require("../services/applicationService");
const chatService = require("../services/chat.service");
const { uploadFileToS3 } = require("../utils/s3Upload");
const config = require("../config/config");

const MATCH_THRESHOLD = config.matchScoreThreshold || 60;

/**
 * Apply to a job (Full-Time / Resume Flow)
 * @route POST /v1/applications/apply/:jobId
 */
const applyToJob = catchAsync(async (req, res) => {
  const { jobId } = req.params;
  const applicantId = req.user.id;

  const job = await Job.findById(jobId);
  if (!job) {
    throw new ApiError(httpStatus.NOT_FOUND, "Job not found");
  }

  const expiryTime = job.expiresAt
    ? new Date(job.expiresAt).getTime()
    : job.createdAt && job.activePeriod
      ? new Date(job.createdAt).getTime() + job.activePeriod * 24 * 60 * 60 * 1000
      : null;
  const hasStartedOrEnded =
    job.orderTracking && job.orderTracking.status !== "not_started";

  if (
    job.status !== "active" ||
    hasStartedOrEnded ||
    (expiryTime && Date.now() >= expiryTime)
  ) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "This job is no longer accepting applications."
    );
  }

  if (job.applicationFlow !== "resume-application") {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "This job accepts proposal applications, not resume-based applications."
    );
  }

  const existingApplication = await Application.findOne({ job: jobId, applicant: applicantId });
  if (existingApplication) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "You have already applied for this job."
    );
  }

  if (!req.file) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Please upload your resume file (PDF, DOC, DOCX, or TXT).");
  }

  let resumeText = "";
  try {
    resumeText = await applicationService.extractResumeText(req.file);
  } catch (err) {
    throw new ApiError(httpStatus.BAD_REQUEST, err.message || "Failed to extract text from resume.");
  }

  const applicantAccount = await User.findById(applicantId).select("name").lean();
  try {
    await applicationService.validateResumeAuthenticity(resumeText, applicantAccount?.name, applicantId);
  } catch (err) {
    throw new ApiError(httpStatus.BAD_REQUEST, err.message);
  }

  let resumeUrl = "";
  try {
    const s3Result = await uploadFileToS3({ ...req.file, fieldname: "resume" }, applicantId);
    resumeUrl = s3Result.url || s3Result.Location || "";
  } catch (err) {
    console.warn("S3 Upload fallback for resume:", err.message);
    resumeUrl = `/uploads/resumes/${req.file.originalname}`;
  }

  let parsedResume = {};
  try {
    parsedResume = await applicationService.parseResume(resumeText, job.description);
  } catch (err) {
    console.warn("Parse resume warning:", err.message);
  }

  const { matchScore, gamingFlags } = await applicationService.scoreMatch(parsedResume, job, resumeText);

  let status = "test-sent";
  let testData = { generatedAt: null, questions: [], submittedAt: null, answers: [], evaluation: null };

  try {
    const questions = await applicationService.generateScreeningTest(parsedResume, job, applicantId);
    testData = {
      generatedAt: new Date(),
      questions,
      submittedAt: null,
      answers: [],
      evaluation: null,
    };
  } catch (testErr) {
    console.warn("Test generation warning:", testErr.message);
  }

  const application = await Application.create({
    job: jobId,
    applicant: applicantId,
    resumeUrl,
    parsedResume,
    matchScore,
    gamingFlags,
    test: testData,
    status,
  });

  // Create Chat Card & Notification for job creator so it appears under Messages / Job Applications
  try {
    const jobOwnerId = job.createdBy;
    if (jobOwnerId && String(jobOwnerId) !== String(applicantId)) {
      const applicantUser = await User.findById(applicantId);
      const cardData = {
        type: "jobApplication",
        jobId: job._id.toString(),
        jobTitle: job.projectTitle || job.position || "Full-Time Application",
        applicantName: applicantUser?.name || "Applicant",
        matchScore: matchScore,
        applicationId: application._id.toString(),
        employmentType: job.employmentType || "full-time",
      };

      await chatService.saveMessage(
        applicantId,
        jobOwnerId,
        `Submitted application for ${job.projectTitle || "Role"}`,
        cardData,
        [],
        "job_application",
        job._id.toString()
      );

      await Notification.create({
        type: "job_application",
        receiver: jobOwnerId,
        sender: applicantId,
        message: `${applicantUser?.name || "Candidate"} applied for ${job.projectTitle || "your job"}`,
        data: {
          jobId: job._id.toString(),
          applicationId: application._id.toString(),
        },
        isRead: false,
      });
    }
  } catch (chatErr) {
    console.warn("Application chat/notification creation warning:", chatErr.message);
  }

  return res.status(httpStatus.CREATED).json({
    success: true,
    message: "Application submitted successfully",
    data: application,
  });
});

/**
 * Get Application Status
 * @route GET /v1/applications/:applicationId
 */
const getApplicationStatus = catchAsync(async (req, res) => {
  const { applicationId } = req.params;

  let application;
  if (applicationId.match(/^[0-9a-fA-F]{24}$/)) {
    application = await Application.findById(applicationId)
      .populate("job", "projectTitle position company employmentType workMode applicationFlow createdBy")
      .populate("applicant", "name email profilePicture");
  }

  if (!application) {
    application = await Application.findOne({ job: req.query.jobId, applicant: req.user.id })
      .populate("job", "projectTitle position company employmentType workMode applicationFlow createdBy")
      .populate("applicant", "name email profilePicture");
  }

  if (!application) {
    throw new ApiError(httpStatus.NOT_FOUND, "Application not found");
  }

  const isApplicant = application.applicant._id.toString() === req.user.id.toString();
  const isPoster = application.job && application.job.createdBy && application.job.createdBy.toString() === req.user.id.toString();

  if (!isApplicant && !isPoster) {
    throw new ApiError(httpStatus.FORBIDDEN, "You do not have permission to view this application");
  }

  return res.status(httpStatus.OK).json({
    success: true,
    data: application,
  });
});

/**
 * Generate Screening Test for Application
 * @route POST /v1/applications/:applicationId/generate-test
 */
const generateTest = catchAsync(async (req, res) => {
  const { applicationId } = req.params;

  const application = await Application.findById(applicationId).populate("job");
  if (!application) {
    throw new ApiError(httpStatus.NOT_FOUND, "Application not found");
  }

  if (application.applicant.toString() !== req.user.id.toString()) {
    throw new ApiError(httpStatus.FORBIDDEN, "Access denied");
  }

  if (application.test && application.test.questions && application.test.questions.length > 0) {
    return res.status(httpStatus.OK).json({
      success: true,
      message: "Test already generated",
      data: application.test,
    });
  }

  if (application.matchScore < MATCH_THRESHOLD) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Match score (${application.matchScore}%) is below requirement threshold (${MATCH_THRESHOLD}%) to trigger a screening test.`
    );
  }

  const questions = await applicationService.generateScreeningTest(application.parsedResume, application.job, req.user.id);

  application.test = {
    generatedAt: new Date(),
    questions,
    submittedAt: null,
    answers: [],
    evaluation: null,
  };
  application.status = "test-sent";
  await application.save();

  return res.status(httpStatus.OK).json({
    success: true,
    message: "Screening test generated",
    data: application.test,
  });
});

/**
 * Submit Test Answers
 * @route POST /v1/applications/:applicationId/submit-test
 */
const submitTestAnswers = catchAsync(async (req, res) => {
  const { applicationId } = req.params;
  const { answers } = req.body;

  const application = await Application.findById(applicationId);
  if (!application) {
    throw new ApiError(httpStatus.NOT_FOUND, "Application not found");
  }

  if (application.applicant.toString() !== req.user.id.toString()) {
    throw new ApiError(httpStatus.FORBIDDEN, "Access denied");
  }

  if (!application.test || !application.test.questions || application.test.questions.length === 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, "No test found for this application.");
  }

  if (application.test.submittedAt) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Test answers have already been submitted.");
  }

  const evaluation = await applicationService.evaluateTestAnswers(application.test.questions, answers || [], req.user.id);

  application.test.submittedAt = new Date();
  application.test.answers = answers || [];
  application.test.evaluation = evaluation;
  application.status = "test-completed";
  await application.save();

  return res.status(httpStatus.OK).json({
    success: true,
    message: "Test submitted and evaluated successfully",
    data: {
      evaluation,
      status: application.status,
    },
  });
});

/**
 * List Applications for a Job (Poster View)
 * @route GET /v1/applications/job/:jobId
 */
const listApplicationsForJob = catchAsync(async (req, res) => {
  const { jobId } = req.params;

  const job = await Job.findById(jobId);
  if (!job) {
    throw new ApiError(httpStatus.NOT_FOUND, "Job not found");
  }

  if (job.createdBy.toString() !== req.user.id.toString()) {
    throw new ApiError(httpStatus.FORBIDDEN, "Only the job creator can view applicants.");
  }

  const filter = { job: jobId };
  if (req.query.status) {
    filter.status = req.query.status;
  }

  const options = pick(req.query, ["sortBy", "limit", "page"]);
  if (!options.sortBy) {
    options.sortBy = "matchScore:desc";
  }

  const applications = await Application.paginate(filter, {
    ...options,
    populate: "applicant:name,email,profilePicture,address",
  });

  // Sync chat entries so past applications also display under Messages -> Job Applications
  try {
    const jobOwnerIdStr = job.createdBy ? job.createdBy.toString() : null;
    const appsDocs = applications.docs || [];
    for (const appItem of appsDocs) {
      if (appItem && appItem.applicant) {
        const applicantIdStr = appItem.applicant._id ? appItem.applicant._id.toString() : appItem.applicant.toString();
        if (jobOwnerIdStr && jobOwnerIdStr !== applicantIdStr) {
          const cardData = {
            type: "jobApplication",
            jobId: jobId.toString(),
            jobTitle: job.projectTitle || job.position || "Full-Time Application",
            applicantName: appItem.applicant.name || "Applicant",
            matchScore: appItem.matchScore || 0,
            applicationId: appItem._id.toString(),
            employmentType: job.employmentType || "full-time",
          };
          await chatService.saveMessage(
            applicantIdStr,
            jobOwnerIdStr,
            `Application submitted for ${job.projectTitle || "Role"}`,
            cardData,
            [],
            "job_application",
            jobId.toString()
          );
        }
      }
    }
  } catch (backfillErr) {
    console.warn("Backfill application chat warning:", backfillErr.message);
  }

  return res.status(httpStatus.OK).json({
    success: true,
    data: applications,
  });
});

/**
 * Update Application Status (Poster View)
 * @route PATCH /v1/applications/:applicationId/status
 */
const updateApplicationStatus = catchAsync(async (req, res) => {
  const { applicationId } = req.params;
  const { status } = req.body;

  const validStatuses = [
    "applied",
    "screening",
    "test-sent",
    "test-completed",
    "under-review",
    "rejected",
    "shortlisted",
    "hired",
  ];

  if (!status || !validStatuses.includes(status)) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Invalid status. Must be one of: ${validStatuses.join(", ")}`);
  }

  const application = await Application.findById(applicationId).populate("job");
  if (!application) {
    throw new ApiError(httpStatus.NOT_FOUND, "Application not found");
  }

  if (application.job.createdBy.toString() !== req.user.id.toString()) {
    throw new ApiError(httpStatus.FORBIDDEN, "Only the job creator can update applicant status.");
  }

  application.status = status;
  await application.save();

  return res.status(httpStatus.OK).json({
    success: true,
    message: `Application status updated to ${status}`,
    data: application,
  });
});

/**
 * Withdraw Application (Applicant View)
 * @route DELETE /v1/applications/:applicationId
 */
const withdrawApplication = catchAsync(async (req, res) => {
  const { applicationId } = req.params;

  const application = await Application.findById(applicationId);
  if (!application) {
    throw new ApiError(httpStatus.NOT_FOUND, "Application not found");
  }

  if (application.applicant.toString() !== req.user.id.toString()) {
    throw new ApiError(httpStatus.FORBIDDEN, "You can only withdraw your own application.");
  }

  await application.remove();

  return res.status(httpStatus.OK).json({
    success: true,
    message: "Application withdrawn successfully",
  });
});

/**
 * Get My Applications (Applicant View)
 * @route GET /v1/applications/my-applications
 */
const getMyApplications = catchAsync(async (req, res) => {
  const filter = { applicant: req.user.id };
  const options = pick(req.query, ["sortBy", "limit", "page"]);
  options.sortBy = options.sortBy || "createdAt:desc";

  const result = await Application.paginate(filter, {
    ...options,
    populate: "job:projectTitle,position,budget,createdBy,company,designCategory,employmentType,workMode",
  });

  return res.status(httpStatus.OK).json({
    success: true,
    data: result,
  });
});

const getApplicationsAdmin = catchAsync(async (req, res) => {
  const applications = await Application.find({})
    .populate("job", "projectTitle position status employmentType workMode")
    .populate("applicant", "name email profilePicture")
    .sort({ createdAt: -1 });
  return res.status(httpStatus.OK).json({ success: true, data: applications });
});

const updateApplicationStatusAdmin = catchAsync(async (req, res) => {
  const validStatuses = ["applied", "screening", "test-sent", "test-completed", "under-review", "rejected", "shortlisted", "hired"];
  if (!validStatuses.includes(req.body.status)) throw new ApiError(httpStatus.BAD_REQUEST, "Invalid application status");
  const application = await Application.findByIdAndUpdate(req.params.applicationId, { status: req.body.status }, { new: true, runValidators: true });
  if (!application) throw new ApiError(httpStatus.NOT_FOUND, "Application not found");
  return res.status(httpStatus.OK).json({ success: true, data: application });
});

module.exports = {
  applyToJob,
  getApplicationStatus,
  generateTest,
  submitTestAnswers,
  listApplicationsForJob,
  updateApplicationStatus,
  withdrawApplication,
  getMyApplications,
  getApplicationsAdmin,
  updateApplicationStatusAdmin,
};
