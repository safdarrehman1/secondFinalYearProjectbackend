const httpStatus = require("http-status");
const ApiError = require("../utils/ApiError");

const transitions = {
  pending_payment: ["active", "cancel"],
  active: ["inprogress", "accepted", "cancel"],
  inprogress: ["accepted", "cancel"],
  accepted: ["delivered", "cancel"],
  delivered: ["revision", "complete", "disputed"],
  revision: ["delivered", "disputed"],
  disputed: ["revision", "complete", "cancel"],
  complete: [],
  cancel: [],
};

const assertTransition = (from, to) => {
  if (from === to) return;
  if (!(transitions[from] || []).includes(to)) {
    throw new ApiError(
      httpStatus.CONFLICT,
      `Order cannot move from ${from} to ${to}`,
    );
  }
};

module.exports = { transitions, assertTransition };
