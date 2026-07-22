const { AiLog } = require("../models");
const logger = require("../config/logger");

/**
 * Log AI request details for auditing and monitoring
 * @param {object} logData
 * @param {string} logData.userId
 * @param {string} logData.endpoint
 * @param {string} logData.model
 * @param {number} logData.promptTokens
 * @param {number} logData.completionTokens
 * @param {number} logData.totalTokens
 * @param {number} logData.latencyMs
 * @param {string} logData.status
 * @param {string} [logData.errorMessage]
 */
const logAiRequest = async ({
  userId,
  endpoint,
  model,
  promptTokens = 0,
  completionTokens = 0,
  totalTokens = 0,
  latencyMs,
  status,
  errorMessage,
}) => {
  try {
    await AiLog.create({
      user: userId || null,
      endpoint,
      model: model || "unknown",
      promptTokens,
      completionTokens,
      totalTokens,
      latencyMs,
      status,
      errorMessage: errorMessage ? String(errorMessage).slice(0, 1000) : undefined,
    });
  } catch (error) {
    logger.error("Failed to write AI Log:", error);
  }
};

module.exports = {
  logAiRequest,
};
