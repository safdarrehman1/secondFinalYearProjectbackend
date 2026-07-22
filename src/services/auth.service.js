const httpStatus = require("http-status");
const tokenService = require("./token.service");
const userService = require("./user.service");
const Token = require("../models/token.model");
const ApiError = require("../utils/ApiError");
const { tokenTypes } = require("../config/tokens");
const moment = require("moment");

const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCK_MS = 15 * 60 * 1000;

const verifyPasswordLogin = async (user, password, errorMessage) => {
  if (user?.loginLockedUntil && user.loginLockedUntil > new Date()) {
    throw new ApiError(
      httpStatus.TOO_MANY_REQUESTS,
      "Too many failed login attempts. Try again later",
    );
  }

  if (!user || !(await user.isPasswordMatch(password))) {
    if (user) {
      const nextAttempts = (user.failedLoginAttempts || 0) + 1;
      const update =
        nextAttempts >= MAX_LOGIN_ATTEMPTS
          ? {
              failedLoginAttempts: 0,
              loginLockedUntil: new Date(Date.now() + LOGIN_LOCK_MS),
            }
          : { failedLoginAttempts: nextAttempts };
      await user.constructor.updateOne({ _id: user._id }, { $set: update });
    }
    throw new ApiError(httpStatus.UNAUTHORIZED, errorMessage);
  }

  await user.constructor.updateOne(
    { _id: user._id },
    {
      $set: { failedLoginAttempts: 0, lastLoginAt: new Date() },
      $unset: { loginLockedUntil: 1 },
    },
  );
  return user;
};

/**
 * Login with email/username and password
 * @param {string} email
 * @param {string} password
 * @returns {Promise<User>}
 */
const loginUserWithEmailAndPassword = async (email, password) => {
  const user = await userService.getUserByEmail(email);
  return verifyPasswordLogin(user, password, "Incorrect email or password");
};

/**
 * Login with name and password
 * @param {string} name
 * @param {string} password
 * @returns {Promise<User>}
 */
const loginUserWithNameAndPassword = async (name, password) => {
  const user = await userService.getUserByName(name);
  return verifyPasswordLogin(user, password, "Incorrect name or password");
};

/**
 * Login with email/name and password
 * @param {string} emailOrName
 * @param {string} password
 * @returns {Promise<User>}
 */
const loginUser = async (emailOrName, password) => {
  // Try to find user by email or name
  let user = null;

  // Check if it's an email (contains @)
  const isEmail = emailOrName.includes("@");

  if (isEmail) {
    // Try email first
    user = await userService.getUserByEmail(emailOrName);
  } else {
    // Try name first, then fallback to email (in case name contains no @)
    user = await userService.getUserByName(emailOrName);
    if (!user) {
      user = await userService.getUserByEmail(emailOrName);
    }
  }

  return verifyPasswordLogin(
    user,
    password,
    "Incorrect email/name or password",
  );
};

/**
 * Logout
 * @param {string} refreshToken
 * @returns {Promise}
 */
const logout = async (refreshToken) => {
  const refreshTokenDoc = await Token.findOne({
    token: refreshToken,
    type: tokenTypes.REFRESH,
    blacklisted: false,
  });
  if (!refreshTokenDoc) {
    throw new ApiError(httpStatus.NOT_FOUND, "Not found");
  }
  await refreshTokenDoc.remove();
};

/**
 * Refresh auth tokens
 * @param {string} refreshToken
 * @returns {Promise<Object>}
 */
const refreshAuth = async (refreshToken) => {
  try {
    const refreshTokenDoc = await tokenService.verifyToken(
      refreshToken,
      tokenTypes.REFRESH,
    );
    const user = await userService.getUserById(refreshTokenDoc.user);
    if (!user) {
      throw new Error();
    }
    await refreshTokenDoc.remove();
    return tokenService.generateAuthTokens(user);
  } catch (error) {
    throw new ApiError(httpStatus.UNAUTHORIZED, "Please login first");
  }
};

/**
 * Reset password
 * @param {string} resetPasswordToken
 * @param {string} newPassword
 * @returns {Promise}
 */
const resetPassword = async (resetPasswordToken, newPassword) => {
  try {
    const resetPasswordTokenDoc = await tokenService.verifyToken(
      resetPasswordToken,
      tokenTypes.RESET_PASSWORD,
    );
    const user = await userService.getUserById(resetPasswordTokenDoc.user);
    if (!user) {
      throw new Error();
    }
    await userService.updateUserById(user.id, { password: newPassword });
    await Token.deleteMany({ user: user.id, type: tokenTypes.RESET_PASSWORD });
  } catch (error) {
    console.error("Reset Password Error Details:", error);
    throw new ApiError(httpStatus.UNAUTHORIZED, "Password reset failed");
  }
};

/**
 * Verify email
 * @param {string} verifyEmailToken
 * @returns {Promise}
 */
const verifyEmail = async (verifyEmailToken) => {
  try {
    const verifyEmailTokenDoc = await tokenService.verifyToken(
      verifyEmailToken,
      tokenTypes.VERIFY_EMAIL,
    );
    const user = await userService.getUserById(verifyEmailTokenDoc.user);
    if (!user) {
      throw new Error();
    }
    await Token.deleteMany({ user: user.id, type: tokenTypes.VERIFY_EMAIL });
    await userService.updateUserById(user.id, { isEmailVerified: true });
    return true;
  } catch (error) {
    return false;
  }
};

/**
 * Generate forgot password OTP
 * @param {string} email
 * @returns {Promise<Object>}
 */
const generateForgotPasswordOTP = async (email) => {
  const user = await userService.getUserByEmail(email);
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "No users found with this email");
  }
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expires = moment().add(10, "minutes");

  user.resetPasswordOTP = otp;
  user.resetPasswordOTPExpires = expires;
  await user.save();

  return { otp, user };
};

/**
 * Verify OTP and reset password
 * @param {string} email
 * @param {string} otp
 * @param {string} newPassword
 * @returns {Promise}
 */
const verifyOTPAndResetPassword = async (email, otp, newPassword) => {
  const user = await userService.getUserByEmail(email);
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found");
  }

  if (
    !user.resetPasswordOTP ||
    user.resetPasswordOTP !== otp ||
    !user.resetPasswordOTPExpires ||
    moment().isAfter(user.resetPasswordOTPExpires)
  ) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid or expired OTP");
  }

  await userService.updateUserById(user.id, { password: newPassword });

  // Clear OTP fields
  user.resetPasswordOTP = undefined;
  user.resetPasswordOTPExpires = undefined;
  await user.save();
};

module.exports = {
  loginUserWithEmailAndPassword,
  loginUserWithNameAndPassword,
  loginUser,
  logout,
  refreshAuth,
  resetPassword,
  verifyEmail,
  generateForgotPasswordOTP,
  verifyOTPAndResetPassword,
};
