const Joi = require("joi");
const { password } = require("./custom.validation");

const register = {
  body: Joi.object().keys({
    email: Joi.string().required().email(),
    password: Joi.string().required().custom(password),
    name: Joi.string().required(),
    roles: Joi.array()
      .items(Joi.string().valid("company", "employee", "freelancer"))
      .min(1)
      .unique()
      .default(["employee", "freelancer"])
      .custom((roles, helpers) => {
        if (roles.includes("company") && roles.length > 1) {
          return helpers.message({ custom: "Company accounts must be exclusive" });
        }
        return roles;
      }),
    activeContext: Joi.string().valid("company", "employee", "freelancer"),
    companyProfile: Joi.object({
      companyName: Joi.string().required(),
      industry: Joi.string().required(),
      companySize: Joi.string().required(),
      verificationInfo: Joi.string().allow(""),
    }).optional(),
    professionalProfile: Joi.object({
      skills: Joi.array().items(Joi.string()),
      experience: Joi.string().allow(""),
      portfolioUrl: Joi.string().uri().allow(""),
    }).optional(),
  }).custom((value, helpers) => {
    if (value.activeContext && !value.roles.includes(value.activeContext)) {
      return helpers.message({ custom: "Active context must be one of the account roles" });
    }
    if (value.roles.includes("company") && !value.companyProfile) {
      return helpers.message({ custom: "Company profile is required for Company accounts" });
    }
    if (!value.roles.includes("company") && value.companyProfile) {
      return helpers.message({ custom: "Company profile is only allowed for Company accounts" });
    }
    return value;
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
