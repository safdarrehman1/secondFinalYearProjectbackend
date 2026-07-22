const httpStatus = require("http-status");
const ApiError = require("../../utils/ApiError");

const transitions = {
  draft: ["scheduled", "published", "closed"],
  scheduled: ["draft", "published", "closed"],
  published: ["paused", "filled", "closed"],
  paused: ["published", "filled", "closed"],
  filled: ["closed", "published"],
  closed: ["published", "archived"],
  archived: [],
};

const effectiveStatus = (job, now = new Date()) => {
  if (job.status === "scheduled" && job.publishAt && job.publishAt <= now) return "published";
  if (job.status === "published" && job.expiresAt && job.expiresAt <= now) return "closed";
  return job.status;
};

const syncEffectiveStatus = async (job, actorId = job.poster, now = new Date()) => {
  const next = effectiveStatus(job, now);
  if (next === job.status) return job;
  const from = job.status;
  job.status = next;
  if (next === "closed") job.closedAt = now;
  job.lifecycleHistory.push({ from, to: next, changedBy: actorId, reason: from === "scheduled" ? "Scheduled publication time reached" : "Job expiration time reached", changedAt: now });
  await job.save();
  return job;
};

const transition = async (job, to, actorId, reason, fields = {}) => {
  if (!(transitions[job.status] || []).includes(to)) throw new ApiError(httpStatus.CONFLICT, `Job cannot move from ${job.status} to ${to}`);
  const from = job.status;
  Object.assign(job, fields, { status: to });
  if (to === "filled") job.filledAt = new Date();
  if (to === "closed") job.closedAt = new Date();
  if (to === "published") { job.publishAt = undefined; job.closedAt = undefined; }
  job.lifecycleHistory.push({ from, to, changedBy: actorId, reason, changedAt: new Date() });
  await job.save();
  return job;
};

const isAcceptingApplications = (job, now = new Date()) => effectiveStatus(job, now) === "published";

module.exports = { effectiveStatus, syncEffectiveStatus, transition, isAcceptingApplications };
