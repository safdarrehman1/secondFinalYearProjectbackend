const rateLimit = require('express-rate-limit');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  skipSuccessfulRequests: true,
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
});

const statusAssistantLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 3 : 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many assistant requests. Please try again later.' },
});

module.exports = {
  authLimiter,
  apiLimiter,
  statusAssistantLimiter,
};
