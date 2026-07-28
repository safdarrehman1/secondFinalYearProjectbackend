const crypto = require("crypto");
const httpStatus = require("http-status");
const ApiError = require("../../utils/ApiError");
const { successResponse } = require("../../utils/response");
const Job = require("./filtration-job.model");
const Test = require("./filtration-test.model");
const Application = require("./filtration-application.model");
const Submission = require("./test-submission.model");
const scoring = require("./scoring.service");
const lifecycle = require("./job-lifecycle.service");
const applicationStatus = require("./application-status.service");
const Resume = require("./resume-document.model");
const applicationService = require("../../services/applicationService");
const { uploadFileToS3 } = require("../../utils/s3Upload");
const notificationService = require("../../services/notification.service");
const { buildImprovementReport } = require("./improvement-report.service");

const resumeSimilarity = (left, right) => {
  const tokens = (text) => new Set(String(text || "").toLowerCase().match(/[a-z0-9+#.]{2,}/g) || []);
  const a = tokens(left); const b = tokens(right);
  if (!a.size || !b.size) return 0;
  const intersection = [...a].filter((token) => b.has(token)).length;
  return intersection / new Set([...a, ...b]).size;
};
const seededShuffle = (items, seedText) => { const output = [...items]; let seed = String(seedText).split("").reduce((sum, char) => sum + char.charCodeAt(0), 0) || 1; for (let index = output.length - 1; index > 0; index -= 1) { seed = (seed * 9301 + 49297) % 233280; const target = Math.floor((seed / 233280) * (index + 1)); [output[index], output[target]] = [output[target], output[index]]; } return output; };

const emitUpdate = (req, application, event) => {
  const payload = { applicationId: application.id, finalStatus: application.finalStatus, testStatus: application.testStatus, event };
  const io = req.app.get("io");
  if (io) io.to(`candidate:${application.candidate}`).emit("application:update", payload);
  notificationService.createNotification("application_status", application.candidate, req.user.id, `Application status updated to ${application.finalStatus.replaceAll("_", " ")}`, { applicationId: application.id, path: `/applications/${application.id}`, dedupeKey: `application:${application.id}:${application.finalStatus}` }).then((notification) => { if (io && notification) io.to(`candidate:${application.candidate}`).emit("notification:new", notification); }).catch(() => undefined);
};
const ownJob = async (id, userId) => {
  const job = await Job.findById(id);
  if (!job) throw new ApiError(httpStatus.NOT_FOUND, "Job not found");
  if (String(job.poster) !== String(userId)) throw new ApiError(httpStatus.FORBIDDEN, "Only the poster can manage this job");
  return job;
};

exports.createJob = async (req, res) => successResponse(res, await Job.create({ ...req.body, poster: req.user.id }), "Job draft created", 201);
exports.uploadResume = async (req, res) => {
  if (!req.file) throw new ApiError(400, "Resume file is required");
  const extractedText = await applicationService.extractResumeText(req.file);
  if (extractedText.trim().length < 50) throw new ApiError(400, "The resume does not contain enough readable text");
  const uploaded = await uploadFileToS3({ ...req.file, fieldname: "resume" }, req.user.id);
  const resume = await Resume.create({ owner: req.user.id, name: req.body.name || req.file.originalname, originalName: req.file.originalname, url: uploaded.url, storageKey: uploaded.key, mimeType: req.file.mimetype, size: req.file.size, extractedText });
  return successResponse(res, resume, "Resume uploaded", 201);
};
exports.listResumes = async (req, res) => successResponse(res, await Resume.find({ owner: req.user.id }).sort("-createdAt"), "Saved resumes");
exports.updateJob = async (req, res) => {
  const job = await ownJob(req.params.id, req.user.id);
  if (job.status !== "draft") throw new ApiError(httpStatus.CONFLICT, "Only draft jobs can be edited");
  Object.assign(job, req.body); await job.save(); return successResponse(res, job, "Job updated");
};
exports.publishJob = async (req, res) => { const job = await ownJob(req.params.id, req.user.id); await lifecycle.transition(job, "published", req.user.id, req.body.reason || "Published by poster", { expiresAt: req.body.expiresAt }); return successResponse(res, job, "Job published"); };
exports.scheduleJob = async (req, res) => { const job = await ownJob(req.params.id, req.user.id); await lifecycle.transition(job, "scheduled", req.user.id, req.body.reason || "Publication scheduled", { publishAt: req.body.publishAt, expiresAt: req.body.expiresAt }); return successResponse(res, job, "Job scheduled"); };
exports.pauseJob = async (req, res) => { const job = await ownJob(req.params.id, req.user.id); await lifecycle.transition(job, "paused", req.user.id, req.body.reason || "Applications paused"); return successResponse(res, job, "Applications paused"); };
exports.resumeJob = async (req, res) => { const job = await ownJob(req.params.id, req.user.id); await lifecycle.transition(job, "published", req.user.id, req.body.reason || "Applications resumed", { expiresAt: req.body.expiresAt || job.expiresAt }); return successResponse(res, job, "Applications resumed"); };
exports.fillJob = async (req, res) => { const job = await ownJob(req.params.id, req.user.id); await lifecycle.transition(job, "filled", req.user.id, req.body.reason || "Position filled"); return successResponse(res, job, "Position filled"); };
exports.closeJob = async (req, res) => { const job = await ownJob(req.params.id, req.user.id); await lifecycle.transition(job, "closed", req.user.id, req.body.reason || "Closed by poster"); return successResponse(res, job, "Job closed"); };
exports.reopenJob = async (req, res) => { const job = await ownJob(req.params.id, req.user.id); await lifecycle.transition(job, "published", req.user.id, req.body.reason || "Reopened by poster", { expiresAt: req.body.expiresAt }); return successResponse(res, job, "Job reopened"); };
exports.createTest = async (req, res) => { await ownJob(req.params.id, req.user.id); const test = await Test.create({ ...req.body, job: req.params.id }); return successResponse(res, test, "Test attached", 201); };
exports.listJobs = async (req, res) => {
  const page = Number(req.query.page || 1); const limit = Number(req.query.limit || 20);
  await Job.updateMany({ status: "scheduled", publishAt: { $lte: new Date() } }, { $set: { status: "published" } });
  await Job.updateMany({ status: "published", expiresAt: { $lte: new Date() } }, { $set: { status: "closed", closedAt: new Date() } });
  const query = { status: "published", ...(req.query.type ? { type: req.query.type } : {}) };
  const [items, total] = await Promise.all([Job.find(query).skip((page - 1) * limit).limit(limit).sort("-createdAt"), Job.countDocuments(query)]);
  return successResponse(res, { items, page, limit, total }, "Published jobs");
};
exports.getJob = async (req, res) => { const job = await Job.findById(req.params.id); if (!job || ["draft", "scheduled", "archived"].includes(job.status)) throw new ApiError(404, "Job not found"); await lifecycle.syncEffectiveStatus(job); return successResponse(res, job); };
exports.pipeline = async (req, res) => {
  await ownJob(req.params.id, req.user.id);
  const query = { job: req.params.id };
  if (req.query.finalStatus) query.finalStatus = req.query.finalStatus;
  if (req.query.flaggedForReview !== undefined) query.flaggedForReview = req.query.flaggedForReview === "true";
  if (req.query.minScore || req.query.maxScore) query["resumeScore.weighted"] = { ...(req.query.minScore ? { $gte: Number(req.query.minScore) } : {}), ...(req.query.maxScore ? { $lte: Number(req.query.maxScore) } : {}) };
  if (req.query.tags) query.tags = { $in: String(req.query.tags).split(",").map((tag) => tag.trim()).filter(Boolean) };
  const sort = req.query.sort === "score" ? { "resumeScore.weighted": -1 } : { createdAt: -1 };
  return successResponse(res, await Application.find(query).populate("candidate", "name email profilePicture").populate("test", "type").sort(sort));
};

exports.apply = async (req, res) => {
  const job = await Job.findById(req.params.id);
  if (!job) throw new ApiError(404, "Job not found");
  await lifecycle.syncEffectiveStatus(job);
  if (!lifecycle.isAcceptingApplications(job)) throw new ApiError(409, `This job is not accepting applications (${job.status})`);
  let resumeText = req.body.resumeText;
  let resumeUrl = req.body.resumeUrl;
  let resumeId;
  if (req.body.resumeId) {
    const savedResume = await Resume.findOne({ _id: req.body.resumeId, owner: req.user.id }).select("+extractedText");
    if (!savedResume) throw new ApiError(404, "Saved resume not found");
    resumeText = savedResume.extractedText; resumeUrl = savedResume.url; resumeId = savedResume.id;
  }
  if (!resumeText || resumeText.trim().length < 50) throw new ApiError(400, "A valid resume is required");
  const previous = await Application.findOne({ job: job.id, candidate: req.user.id }).sort("-createdAt");
  if (previous && (!previous.reapplyAfter || previous.reapplyAfter > new Date())) throw new ApiError(409, "Re-application cooldown is active");
  const fingerprint = crypto.createHash("sha256").update(resumeText.replace(/\s+/g, " ").trim().toLowerCase()).digest("hex");
  const previousCandidates = await Application.find({ candidate: { $ne: req.user.id } })
    .select("resumeFingerprint +resumeText").sort("-createdAt").limit(50);
  const duplicate = previousCandidates.find(
    (item) => item.resumeFingerprint === fingerprint || resumeSimilarity(item.resumeText, resumeText) >= 0.95,
  );
  const test = await Test.findOne({ job: job.id }).sort("-createdAt");
  const application = await Application.create({ job: job.id, candidate: req.user.id, resume: resumeId, resumeUrl, resumeText, resumeFingerprint: fingerprint, test: test?.id, flaggedForReview: Boolean(duplicate), flagReason: duplicate ? "Resume is identical to another candidate submission" : undefined, statusHistory: [{ to: "applied", changedBy: req.user.id, reason: "Application submitted" }] });
  const result = await scoring.scoreResume(resumeText, job);
  application.resumeScore = { raw: result.raw, weighted: result.weighted, breakdown: result.breakdown, provider: result.provider, model: result.model, scoringVersion: result.scoringVersion, confidence: result.confidence, explanation: result.explanation };
  if (result.requiresManualReview) { application.flaggedForReview = true; application.flagReason = [application.flagReason, "Automated resume parsing unavailable; manual review required"].filter(Boolean).join(", "); }
  application.resumeStatus = result.requiresManualReview ? "pending" : (result.weighted >= job.minResumePct ? "passed" : "failed");
  if (result.requiresManualReview) applicationStatus.changeStatus(application, "under_review", req.user.id, "Automated scoring unavailable; queued for manual review");
  else if (application.resumeStatus === "passed" && test) { application.testStatus = "unlocked"; applicationStatus.changeStatus(application, "test_unlocked", req.user.id, "Resume gate passed"); }
  else if (application.resumeStatus === "passed") applicationStatus.changeStatus(application, job.type === "gig" ? "shortlisted" : "resume_screened", req.user.id, "Resume gate passed");
  else {
    applicationStatus.changeStatus(application, "rejected", req.user.id, "Resume score did not meet the required threshold");
    application.reapplyAfter = new Date(Date.now() + job.cooldownDays * 86400000);
    application.improvementReport = buildImprovementReport({ score: result.weighted, parsed: result.parsed, job });
  }
  await application.save(); emitUpdate(req, application, application.finalStatus); return successResponse(res, application, "Application screened", 201);
};
exports.getApplication = async (req, res) => { const item = await Application.findById(req.params.id); if (!item) throw new ApiError(404, "Application not found"); if (![String(item.candidate), String((await Job.findById(item.job))?.poster)].includes(String(req.user.id))) throw new ApiError(403, "Forbidden"); return successResponse(res, item); };
exports.mine = async (req, res) => successResponse(res, await Application.find({ candidate: req.user.id }).populate("job").sort("-createdAt"));
exports.getTest = async (req, res) => { const application = await Application.findOne({ _id: req.params.id, candidate: req.user.id }).populate("test"); if (!application) throw new ApiError(404, "Application not found"); if (!["unlocked", "in_progress"].includes(application.testStatus)) throw new ApiError(403, "Test is locked"); if (application.testStatus === "unlocked") { const attempts = await Submission.countDocuments({ application: application.id }); if (attempts >= application.test.maxAttempts) throw new ApiError(409, "Maximum test attempts reached"); applicationStatus.changeStatus(application, "test_in_progress", req.user.id, "Candidate started the test"); } application.testStatus = "in_progress"; application.testStartedAt ||= new Date(); application.testExpiresAt ||= new Date(application.testStartedAt.getTime() + application.test.timeLimitMinutes * 60000); await application.save(); const test = application.test.toObject(); test.questions = seededShuffle(test.questions, application.id).map(({ correctAnswer, ...question }, index) => ({ ...question, options: question.options ? seededShuffle(question.options, `${application.id}:${index}`) : question.options })); test.expiresAt = application.testExpiresAt; test.savedAnswers = application.draftAnswers; return successResponse(res, test); };
exports.saveTestDraft = async (req, res) => { const application = await Application.findOne({ _id: req.params.id, candidate: req.user.id }); if (!application || application.testStatus !== "in_progress") throw new ApiError(409, "Test is not in progress"); if (application.testExpiresAt <= new Date()) throw new ApiError(409, "Test time has expired"); application.draftAnswers = req.body.answers.map((answer) => ({ ...answer, savedAt: new Date() })); await application.save(); return successResponse(res, { savedAt: new Date() }, "Answers saved"); };
exports.submitTest = async (req, res) => {
  const application = await Application.findOne({ _id: req.params.id, candidate: req.user.id }).populate("test").populate("job");
  if (!application) throw new ApiError(404, "Application not found");
  if (application.testStatus === "completed") return successResponse(res, application, "Test was already submitted");
  if (application.testStatus !== "in_progress") throw new ApiError(409, "Test is not in progress");
  const attemptNumber = await Submission.countDocuments({ application: application.id }) + 1;
  if (attemptNumber > application.test.maxAttempts) throw new ApiError(409, "Maximum test attempts reached");
  const submittedAnswers = req.body.answers?.length ? req.body.answers : application.draftAnswers;
  const result = application.test.type === "mcq"
    ? scoring.scoreMcq(application.test, submittedAnswers)
    : await scoring.scoreTask(application.test, submittedAnswers, application.candidate);
  const elapsed = Date.now() - new Date(application.testStartedAt).getTime(); const flags = [...(req.body.proctoringFlags || [])]; if (elapsed < 30000) flags.push("near_instant_submission");
  if (application.testExpiresAt && new Date() > application.testExpiresAt) flags.push("time_expired");
  await Submission.create({ application: application.id, answers: submittedAnswers, score: result.score, submittedAt: new Date(), proctoringFlags: [...new Set(flags)], justification: result.justification, attemptNumber });
  application.testScore = result.score; application.testBreakdown = { justification: result.justification }; application.testStatus = "completed"; application.draftAnswers = []; application.flaggedForReview ||= flags.length > 0 || result.requiresManualReview; if (flags.length || result.requiresManualReview) application.flagReason = [...new Set([application.flagReason, ...flags, result.requiresManualReview ? "Task assessment requires manual scoring" : null].filter(Boolean))].join(", ");
  applicationStatus.changeStatus(application, result.requiresManualReview ? "under_review" : (result.score >= application.job.minTestPct ? (application.job.type === "gig" ? "shortlisted" : "test_completed") : "rejected"), req.user.id, result.requiresManualReview ? "Task assessment queued for manual scoring" : (result.score >= application.job.minTestPct ? "Test gate passed" : "Test score did not meet the required threshold"));
  if (application.finalStatus === "rejected") application.reapplyAfter = new Date(Date.now() + application.job.cooldownDays * 86400000);
  await application.save(); emitUpdate(req, application, application.finalStatus); return successResponse(res, application, "Test scored");
};
exports.review = async (req, res) => { const application = await Application.findById(req.params.id); if (!application) throw new ApiError(404, "Application not found"); await ownJob(application.job, req.user.id); applicationStatus.changeStatus(application, req.body.finalStatus, req.user.id, req.body.reason); await application.save(); emitUpdate(req, application, application.finalStatus); return successResponse(res, application, "Application reviewed"); };
exports.withdraw = async (req, res) => { const application = await Application.findOne({ _id: req.params.id, candidate: req.user.id }); if (!application) throw new ApiError(404, "Application not found"); applicationStatus.changeStatus(application, "withdrawn", req.user.id, req.body.reason || "Withdrawn by candidate"); await application.save(); emitUpdate(req, application, "withdrawn"); return successResponse(res, application, "Application withdrawn"); };
exports.updateManagement = async (req, res) => { const application = await Application.findById(req.params.id); if (!application) throw new ApiError(404, "Application not found"); await ownJob(application.job, req.user.id); if (req.body.posterNotes !== undefined) application.posterNotes = req.body.posterNotes; if (req.body.tags !== undefined) application.tags = [...new Set(req.body.tags.map((tag) => tag.trim()).filter(Boolean))]; await application.save(); return successResponse(res, application, "Application details updated"); };
exports.overrideScore = async (req, res) => { const application = await Application.findById(req.params.id); if (!application) throw new ApiError(404, "Application not found"); const job = await ownJob(application.job, req.user.id); application.resumeScore.weighted = req.body.weighted; application.resumeScore.overriddenBy = req.user.id; application.resumeScore.overrideReason = req.body.reason; application.resumeScore.overriddenAt = new Date(); application.resumeStatus = req.body.weighted >= job.minResumePct ? "passed" : "failed"; application.flaggedForReview = false; applicationStatus.changeStatus(application, application.resumeStatus === "passed" ? "under_review" : "rejected", req.user.id, `Manual score override: ${req.body.reason}`); await application.save(); emitUpdate(req, application, "score_overridden"); return successResponse(res, application, "Resume score overridden"); };
exports.bulkReview = async (req, res) => { const applications = await Application.find({ _id: { $in: req.body.applicationIds }, job: req.params.id }); await ownJob(req.params.id, req.user.id); if (applications.length !== req.body.applicationIds.length) throw new ApiError(400, "One or more applications do not belong to this job"); await Promise.all(applications.map(async (application) => { applicationStatus.changeStatus(application, req.body.finalStatus, req.user.id, req.body.reason); await application.save(); emitUpdate(req, application, application.finalStatus); })); return successResponse(res, { updated: applications.length }, "Applications reviewed"); };
exports.testAttempts = async (req, res) => { const application = await Application.findById(req.params.id); if (!application) throw new ApiError(404, "Application not found"); const job = await Job.findById(application.job); if (![String(application.candidate), String(job?.poster)].includes(String(req.user.id))) throw new ApiError(403, "Forbidden"); return successResponse(res, await Submission.find({ application: application.id }).sort("-attemptNumber"), "Test attempt history"); };
exports.scoreTaskManually = async (req, res) => { const application = await Application.findById(req.params.id).populate("job").populate("test"); if (!application) throw new ApiError(404, "Application not found"); await ownJob(application.job._id, req.user.id); if (application.test?.type !== "task" || application.testStatus !== "completed") throw new ApiError(409, "A completed task assessment is required"); application.testScore = req.body.score; application.testBreakdown = { ...application.testBreakdown, manualJustification: req.body.justification, manuallyScoredBy: req.user.id, manuallyScoredAt: new Date() }; application.flaggedForReview = false; applicationStatus.changeStatus(application, req.body.score >= application.job.minTestPct ? (application.job.type === "gig" ? "shortlisted" : "test_completed") : "rejected", req.user.id, `Manual task score: ${req.body.justification}`); await application.save(); emitUpdate(req, application, "task_scored_manually"); return successResponse(res, application, "Task assessment scored"); };
