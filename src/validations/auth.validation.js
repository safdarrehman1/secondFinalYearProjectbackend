const Joi = require("joi");
const { password } = require("./custom.validation");

const register = {
  body: Joi.object().keys({
    email: Joi.string().required().email(),
    password: Joi.string().required().custom(password),
    name: Joi.string().required(),
  }),
};

const login = {
  body: Joi.object().keys({
    email: Joi.string(),
    username: Joi.string(),
    name: Joi.string(),
    identifier: Joi.string(),
    password: Joi.string().required(),
  }).or("email", "username", "name", "identifier"),
};

const logout = {
  body: Joi.object().keys({
    refreshToken: Joi.string().required(),
  }),
};

const refreshTokens = {
  body: Joi.object().keys({
    refreshToken: Joi.string().required(),
  }),
};

const forgotPassword = {
  body: Joi.object().keys({
    email: Joi.string().email().required(),
  }),
};

const resetPassword = {
  query: Joi.object().keys({
    token: Joi.string().required(),
  }),
  body: Joi.object().keys({
    password: Joi.string().required().custom(password),
  }),
};

const verifyEmail = {
  query: Joi.object().keys({
    token: Joi.string().required(),
  }),
};

const changePassword = {
  body: Joi.object().keys({
    oldPassword: Joi.string(),
    password: Joi.string().required().custom(password),
  }),
};

const forgotPasswordOTP = {
  body: Joi.object().keys({
    email: Joi.string().email().required(),
  }),
};

const resetPasswordOTP = {
  body: Joi.object().keys({
    email: Joi.string().email().required(),
    otp: Joi.string().required().length(6),
    password: Joi.string().required().custom(password),
  }),
};

module.exports = {
  register,
  login,
  logout,
  refreshTokens,
  forgotPassword,
  resetPassword,
  verifyEmail,
  changePassword,
  forgotPasswordOTP,
  resetPasswordOTP,
};
