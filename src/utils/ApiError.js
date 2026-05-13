class ApiError extends Error {
  constructor(
    statusCode,
    message,
    isOperational = true,
    stack = "",
    wiseErrors = undefined,
  ) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.wiseErrors = wiseErrors;
    if (stack) {
      this.stack = stack;
    } else {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

module.exports = ApiError;
