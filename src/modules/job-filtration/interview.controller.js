const ApiError = require("../../utils/ApiError");
const { successResponse } = require("../../utils/response");
const notificationService = require("../../services/notification.service");
const Application = require("./filtration-application.model");
const Job = require("./filtration-job.model");
const Interview = require("./interview.model");
const service = require("./interview.service");
const applicationStatus = require("./application-status.service");

const accessible = async (id, userId, includePrivate = false) => {
  const query = includePrivate ? Interview.findById(id).select("+privateNotes") : Interview.findById(id);
  const item = await query;
  if (!item) throw new ApiError(404, "Interview not found");
  if (![String(item.poster), String(item.candidate)].includes(String(userId))) throw new ApiError(403, "Forbidden");
  return item;
};

const notify = async (req, interview, receiver, message, event) => {
  const notification = await notificationService.createNotification("interview_update", receiver, req.user.id, message, { interviewId: interview.id, applicationId: interview.application, path: "/interviews", dedupeKey: `interview:${interview.id}:${event}` });
  const io = req.app.get("io");
  if (io && notification) io.to(`candidate:${receiver}`).emit("notification:new", notification);
};

exports.propose = async (req, res) => {
  const application = await Application.findById(req.params.id);
  if (!application) throw new ApiError(404, "Application not found");
  const job = await Job.findById(application.job);
  if (String(job.poster) !== String(req.user.id)) throw new ApiError(403, "Only the poster can schedule interviews");
  await service.assertNoConflict({ poster: job.poster, candidate: application.candidate, startsAt: req.body.startsAt, endsAt: req.body.endsAt });
  const interview = await Interview.create({ ...req.body, application: application.id, job: job.id, poster: job.poster, candidate: application.candidate, history: [{ to: "proposed", changedBy: req.user.id, reason: "Interview proposed" }] });
  applicationStatus.changeStatus(application, "interview_requested", req.user.id, "Interview proposed");
  await application.save();
  await notify(req, interview, application.candidate, `Interview proposed for ${job.title}`, "proposed");
  return successResponse(res, interview, "Interview proposed", 201);
};

exports.respond = async (req, res) => {
  const interview = await accessible(req.params.id, req.user.id);
  if (String(interview.candidate) !== String(req.user.id)) throw new ApiError(403, "Only the candidate can respond");
  service.transition(interview, req.body.action, req.user.id, req.body.reason);
  if (req.body.action === "reschedule_requested") interview.rescheduleNote = req.body.reason;
  await interview.save();
  if (req.body.action === "confirmed") { const application = await Application.findById(interview.application); applicationStatus.changeStatus(application, "interview_scheduled", req.user.id, "Interview confirmed"); await application.save(); }
  await notify(req, interview, interview.poster, `Interview ${req.body.action.replaceAll("_", " ")}`, req.body.action);
  return successResponse(res, interview, "Interview response saved");
};

exports.update = async (req, res) => {
  const interview = await accessible(req.params.id, req.user.id, true);
  if (String(interview.poster) !== String(req.user.id)) throw new ApiError(403, "Only the poster can update the interview");
  if (req.body.startsAt) { await service.assertNoConflict({ poster: interview.poster, candidate: interview.candidate, startsAt: req.body.startsAt, endsAt: req.body.endsAt, excludeId: interview.id }); interview.startsAt = req.body.startsAt; interview.endsAt = req.body.endsAt; interview.timezone = req.body.timezone || interview.timezone; interview.meetingLink = req.body.meetingLink || interview.meetingLink; if (interview.status === "reschedule_requested") service.transition(interview, "proposed", req.user.id, "New interview time proposed"); }
  if (req.body.action) service.transition(interview, req.body.action, req.user.id, req.body.reason);
  if (req.body.privateNotes !== undefined) interview.privateNotes = req.body.privateNotes;
  if (req.body.scorecard) interview.scorecard = req.body.scorecard;
  if (req.body.action === "cancelled") interview.cancellationReason = req.body.reason;
  await interview.save();
  if (req.body.startsAt || req.body.action) await notify(req, interview, interview.candidate, req.body.action ? `Interview ${req.body.action}` : "A new interview time was proposed", req.body.action || `rescheduled:${interview.startsAt.toISOString()}`);
  return successResponse(res, interview, "Interview updated");
};

exports.mine = async (req, res) => successResponse(res, await Interview.find({ $or: [{ poster: req.user.id }, { candidate: req.user.id }] }).populate("job", "title type").populate("candidate", "name profilePicture").populate("poster", "name profilePicture").sort("startsAt"), "Interviews");
