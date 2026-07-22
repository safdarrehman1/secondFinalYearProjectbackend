const catchAsync = require("../utils/catchAsync");
const logger = require("../config/logger");
const httpStatus = require("http-status");

/**
 * Log frontend error
 * @route POST /v1/logs/error
 */
const logError = catchAsync(async (req, res) => {
  const { message, stack, url, info } = req.body;
  const userId = req.user ? req.user.id : "anonymous";

  logger.error(
    `[FRONTEND_ERROR] [User: ${userId}] [URL: ${url || "N/A"}] Message: ${message || "No message"} | Stack: ${stack || "No stack"} | Info: ${JSON.stringify(info || {})}`
  );

  res.status(httpStatus.NO_CONTENT).send();
});

module.exports = {
  logError,
};
