const httpStatus = require("http-status");
const ApiError = require("../utils/ApiError");
const catchAsync = require("../utils/catchAsync");
const pick = require("../utils/pick");
const { Job, Application, User, Notification } = require("../models");
const applicationService = require("../services/applicationService");
const chatService = require("../services/chat.service");
const { uploadFileToS3 } = require("../utils/s3Upload");
const config = require("../config/config");
const { hasAccountRole } = require("../utils/accountRoles");

const MATCH_THRESHOLD = config.matchScoreThreshold || 60;

const PIPELINE_TRANSITIONS = {
  applied: ["shortlisted", "interview-scheduled", "rejected"],
  screening: ["shortlisted", "interview-scheduled", "rejected"],
  "test-sent": ["test-completed", "rejected"],
  "test-completed": ["under-review", "shortlisted", "interview-scheduled", "rejected"],
  "under-review": ["shortlisted", "interview-scheduled", "offer-extended", "rejected"],
  shortlisted: ["interview-scheduled", "offer-extended", "rejected"],
  "interview-scheduled": ["interviewed", "interview-scheduled", "offer-extended", "rejected"],
  interviewed: ["offer-extended", "interview-scheduled", "rejected"],
  "offer-extended": ["hired", "offer-extended", "rejected"],
  hired: [],
  rejected: ["shortlisted", "under-review"],
};

const requireJobOwner = (application, userId) => {
  if (!application.job?.createdBy || application.job.createdBy.toString() !== userId.toString()) {
    throw new ApiError(httpStatus.FORBIDDEN, "Only the company that posted this job can perform this action.");
  }
};

const transitionApplication = (application, nextStatus) => {
  const allowed = PIPELINE_TRANSITIONS[application.status] || [];
  if (!allowed.includes(nextStatus)) {
    throw new ApiError(
      httpStatus.CONFLICT,
      `Application cannot move from ${application.status} to ${nextStatus}. Allowed: ${allowed.join(", ") || "none"}`
    );
  }
  application.status = nextStatus;
};

const notifyApplicationEvent = async (application, senderId, receiverId, type, message, cardData) => {
  await Promise.all([
    chatService.saveMessage(
      senderId,
      receiverId,
      message,
      cardData,
      [],
      "job_application",
      application.job._id.toString()
    ),
    Notification.create({
      type,
      receiver: receiverId,
      sender: senderId,
      message,
      data: { applicationId: application._id.toString(), jobId: application.job._id.toString() },
      isRead: false,
    }),
  ]);
};

/**
 * Apply to a job (Full-Time / Resume Flow)
 * @route POST /v1/applications/apply/:jobId
 */
const applyToJob = catchAsync(async (req, res) => {
  const { jobId } = req.params;
  const applicantId = req.user.id;

  if (!hasAccountRole(req.user, "employee")) {
    throw new ApiError(httpStatus.FORBIDDEN, "Only Employee or Hybrid accounts can apply to full-time jobs.");
  }

  const job = await Job.findById(jobId);
  if (!job) {
    throw new ApiError(httpStatus.NOT_FOUND, "Job not found");
  }

  const isAssigned = Boolean(
    job.isAssigned ||
      job.assignedTo ||
      (job.orderTracking &&
        ["in_progress", "completed", "disputed"].includes(
          job.orderTracking.status,
        )),
  );

  if (job.status !== "active" || isAssigned) {
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
  if (job.employmentType === "freelance-project") {
    throw new ApiError(httpStatus.BAD_REQUEST, "Freelance projects use the gig proposal flow.");
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
  const targetJobId = req.query.jobId || req.params.jobId;

  let application = null;
  if (applicationId && applicationId !== "undefined" && applicationId !== "null" && /^[0-9a-fA-F]{24}$/.test(applicationId)) {
    application = await Application.findById(applicationId)
      .populate("job", "projectTitle position company employmentType workMode applicationFlow createdBy")
      .populate("applicant", "name email profilePicture");
  }

  if (!application && targetJobId && targetJobId !== "undefined" && targetJobId !== "null" && /^[0-9a-fA-F]{24}$/.test(targetJobId)) {
    application = await Application.findOne({ job: targetJobId, applicant: req.user.id })
      .populate("job", "projectTitle position company employmentType workMode applicationFlow createdBy")
      .populate("applicant", "name email profilePicture");
  }

  if (!application && applicationId && applicationId !== "undefined" && applicationId !== "null" && /^[0-9a-fA-F]{24}$/.test(applicationId)) {
    application = await Application.findOne({ job: applicationId, applicant: req.user.id })
      .populate("job", "projectTitle position company employmentType workMode applicationFlow createdBy")
      .populate("applicant", "name email profilePicture");
  }

  if (!application) {
    throw new ApiError(httpStatus.NOT_FOUND, "Application not found");
  }

  const isApplicant = application.applicant && application.applicant._id && application.applicant._id.toString() === req.user.id.toString();
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
    populate: "applicant",
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

  const validStatuses = ["shortlisted", "interviewed", "rejected"];

  if (!status || !validStatuses.includes(status)) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Invalid status. Must be one of: ${validStatuses.join(", ")}`);
  }

  const application = await Application.findById(applicationId).populate("job");
  if (!application) {
    throw new ApiError(httpStatus.NOT_FOUND, "Application not found");
  }

  requireJobOwner(application, req.user.id);

  transitionApplication(application, status);
  await application.save();

  return res.status(httpStatus.OK).json({
    success: true,
    message: `Application status updated to ${status}`,
    data: application,
  });
});

const scheduleInterview = catchAsync(async (req, res) => {
  const { meetingLink, scheduledFor, timezone = "UTC", notes = "" } = req.body;
  if (!meetingLink || !/^https?:\/\//i.test(meetingLink)) {
    throw new ApiError(httpStatus.BAD_REQUEST, "A valid meeting link is required.");
  }
  const meetingDate = new Date(scheduledFor);
  if (!scheduledFor || Number.isNaN(meetingDate.getTime()) || meetingDate <= new Date()) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Interview date and time must be in the future.");
  }
  const application = await Application.findById(req.params.applicationId).populate("job").populate("applicant", "name");
  if (!application) throw new ApiError(httpStatus.NOT_FOUND, "Application not found");
  requireJobOwner(application, req.user.id);
  transitionApplication(application, "interview-scheduled");
  application.interview = { meetingLink, scheduledFor: meetingDate, timezone, notes, scheduledBy: req.user.id, scheduledAt: new Date() };
  await application.save();
  await notifyApplicationEvent(application, req.user.id, application.applicant._id, "interview_update", `Interview scheduled for ${application.job.projectTitle || application.job.position}`, {
    type: "interviewScheduled", applicationId: application._id.toString(), jobTitle: application.job.projectTitle || application.job.position,
    meetingLink, scheduledFor: meetingDate.toISOString(), timezone, notes,
  });
  res.status(httpStatus.OK).json({ success: true, message: "Interview scheduled", data: application });
});

const extendFormalOffer = catchAsync(async (req, res) => {
  const { salary, currency = "USD", startDate, terms = "" } = req.body;
  const parsedSalary = Number(salary);
  const parsedStartDate = new Date(startDate);
  if (!Number.isFinite(parsedSalary) || parsedSalary < 0 || !startDate || Number.isNaN(parsedStartDate.getTime())) {
    throw new ApiError(httpStatus.BAD_REQUEST, "A valid salary and start date are required.");
  }
  const application = await Application.findById(req.params.applicationId).populate("job").populate("applicant", "name email");
  if (!application) throw new ApiError(httpStatus.NOT_FOUND, "Application not found");
  requireJobOwner(application, req.user.id);
  transitionApplication(application, "offer-extended");
  const company = await User.findById(req.user.id).select("name companyProfile").lean();
  const jobTitle = application.job.projectTitle || application.job.position || "Position";
  const companyName = company?.companyProfile?.companyName || company?.name || "Company";
  const letterNumber = `OFF-${application._id.toString().slice(-8).toUpperCase()}`;
  const letterBody = `Dear ${application.applicant.name},\n\n${companyName} is pleased to formally offer you the position of ${jobTitle}, with compensation of ${currency} ${parsedSalary.toLocaleString()} and a proposed start date of ${parsedStartDate.toDateString()}.\n\n${terms || "The remaining employment terms will follow company policy and applicable law."}\n\nPlease accept or decline this offer through your Jobs inbox.\n\nSincerely,\n${companyName}`;
  application.formalOffer = { letterNumber, jobTitle, salary: parsedSalary, currency, startDate: parsedStartDate, terms, letterBody, generatedAt: new Date(), extendedBy: req.user.id, decision: "pending", decidedAt: null };
  await application.save();
  await notifyApplicationEvent(application, req.user.id, application.applicant._id, "offer_extended", `Formal offer extended for ${jobTitle}`, {
    type: "formalOffer", applicationId: application._id.toString(), jobTitle, salary: parsedSalary, currency,
    startDate: parsedStartDate.toISOString(), letterNumber, decision: "pending",
  });
  res.status(httpStatus.OK).json({ success: true, message: "Formal offer generated and sent", data: application });
});

const decideFormalOffer = catchAsync(async (req, res) => {
  const { decision } = req.body;
  if (!["accepted", "declined"].includes(decision)) throw new ApiError(httpStatus.BAD_REQUEST, "Decision must be accepted or declined.");
  const application = await Application.findById(req.params.applicationId).populate("job").populate("applicant", "name");
  if (!application) throw new ApiError(httpStatus.NOT_FOUND, "Application not found");
  if (application.applicant._id.toString() !== req.user.id.toString()) throw new ApiError(httpStatus.FORBIDDEN, "Only the candidate can decide this offer.");
  if (application.status !== "offer-extended" || application.formalOffer?.decision !== "pending") throw new ApiError(httpStatus.CONFLICT, "This offer is no longer pending.");
  application.formalOffer.decision = decision;
  application.formalOffer.decidedAt = new Date();
  transitionApplication(application, decision === "accepted" ? "hired" : "rejected");
  await application.save();
  await notifyApplicationEvent(application, req.user.id, application.job.createdBy, "offer_decision", `${application.applicant.name} ${decision} the offer for ${application.job.projectTitle || application.job.position}`, {
    type: "formalOfferDecision", applicationId: application._id.toString(), decision,
  });
  res.status(httpStatus.OK).json({ success: true, message: `Offer ${decision}`, data: application });
});

const downloadOfferLetter = catchAsync(async (req, res) => {
  const application = await Application.findById(req.params.applicationId).populate("job").populate("applicant", "name");
  if (!application || !application.formalOffer?.generatedAt) throw new ApiError(httpStatus.NOT_FOUND, "Offer letter not found");
  const isApplicant = application.applicant._id.toString() === req.user.id.toString();
  const isOwner = application.job.createdBy.toString() === req.user.id.toString();
  if (!isApplicant && !isOwner) throw new ApiError(httpStatus.FORBIDDEN, "You cannot access this offer letter.");
  const escapeHtml = (value) => String(value || "").replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]));
  const paragraphs = escapeHtml(application.formalOffer.letterBody).replace(/\n/g, "<br>");
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename=offer-${application.formalOffer.letterNumber}.html`);
  res.send(`<!doctype html><html><head><meta charset="utf-8"><title>Formal Offer Letter</title><style>body{font:16px/1.6 Arial,sans-serif;max-width:760px;margin:48px auto;color:#172033}h1{color:#087f5b}.meta{color:#64748b;border-bottom:1px solid #ddd;padding-bottom:16px}</style></head><body><h1>Formal Offer Letter</h1><p class="meta">Reference: ${escapeHtml(application.formalOffer.letterNumber)}</p><p>${paragraphs}</p></body></html>`);
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
    populate: "job",
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
  const validStatuses = ["applied", "screening", "test-sent", "test-completed", "under-review", "rejected", "shortlisted", "interview-scheduled", "interviewed", "offer-extended", "hired"];
  if (!validStatuses.includes(req.body.status)) throw new ApiError(httpStatus.BAD_REQUEST, "Invalid application status");
  const application = await Application.findByIdAndUpdate(req.params.applicationId, { status: req.body.status }, { new: true, runValidators: true });
  if (!application) throw new ApiError(httpStatus.NOT_FOUND, "Application not found");
  return res.status(httpStatus.OK).json({ success: true, data: application });
});

const deleteApplicationAdmin = catchAsync(async (req, res) => {
  const application = await Application.findByIdAndDelete(req.params.applicationId);
  if (!application) throw new ApiError(httpStatus.NOT_FOUND, "Application not found");
  return res.status(httpStatus.OK).json({ success: true, message: "Application deleted successfully" });
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
  deleteApplicationAdmin,
  scheduleInterview,
  extendFormalOffer,
  decideFormalOffer,
  downloadOfferLetter,
};
