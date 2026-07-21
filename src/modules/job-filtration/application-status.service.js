const httpStatus = require("http-status");
const ApiError = require("../../utils/ApiError");

const terminal = new Set(["hired", "rejected", "withdrawn"]);

const changeStatus = (application, to, actorId, reason) => {
  if (application.finalStatus === to) return application;
  if (terminal.has(application.finalStatus)) throw new ApiError(httpStatus.CONFLICT, `A ${application.finalStatus} application cannot change status`);
  const from = application.finalStatus;
  application.finalStatus = to;
  application.statusHistory.push({ from, to, changedBy: actorId, reason, changedAt: new Date() });
  if (to === "rejected") application.rejectionReason = reason;
  if (to === "withdrawn") application.withdrawnAt = new Date();
  return application;
};

module.exports = { changeStatus };
