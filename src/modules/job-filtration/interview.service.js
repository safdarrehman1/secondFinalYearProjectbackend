const httpStatus = require("http-status");
const ApiError = require("../../utils/ApiError");
const Interview = require("./interview.model");
const allowed = { proposed: ["confirmed", "reschedule_requested", "cancelled"], confirmed: ["reschedule_requested", "completed", "cancelled"], reschedule_requested: ["proposed", "cancelled"], completed: [], cancelled: [] };
const assertNoConflict = async ({ poster, candidate, startsAt, endsAt, excludeId }) => { const conflict = await Interview.findOne({ _id: { $ne: excludeId }, status: { $in: ["proposed", "confirmed"] }, $or: [{ poster }, { candidate }], startsAt: { $lt: endsAt }, endsAt: { $gt: startsAt } }); if (conflict) throw new ApiError(httpStatus.CONFLICT, "The interview overlaps an existing interview"); };
const transition = (interview, to, actorId, reason) => { if (!(allowed[interview.status] || []).includes(to)) throw new ApiError(httpStatus.CONFLICT, `Interview cannot move from ${interview.status} to ${to}`); const from = interview.status; interview.status = to; interview.history.push({ from, to, changedBy: actorId, reason }); return interview; };
module.exports = { assertNoConflict, transition };
