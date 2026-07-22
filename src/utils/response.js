const successResponse = (res, data = null, message = "Success", statusCode = 200) =>
  res.status(statusCode).json({ success: true, message, data });

const errorResponse = (res, statusCode, message, details) =>
  res.status(statusCode).json({ success: false, message, ...(details ? { details } : {}) });

module.exports = { successResponse, errorResponse };
