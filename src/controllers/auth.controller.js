const httpStatus = require("http-status");
const catchAsync = require("../utils/catchAsync");
const {
  authService,
  userService,
  tokenService,
  emailService,
  userSpaceService,
} = require("../services");
const config = require("../config/config");

const register = catchAsync(async (req, res) => {
  try {
    const user = await userService.createUser({
      ...req.body,
      isEmailVerified: false,
    });

    const tokens = await tokenService.generateAuthTokens(user);
    const verifyEmailToken = await tokenService.generateVerifyEmailToken(user);
    await emailService.sendVerificationEmail(user.email, verifyEmailToken);
    res.status(httpStatus.CREATED).send({ user, tokens });
  } catch (error) {
    console.log("error: ", error);
  }
});

const login = catchAsync(async (req, res) => {
  const identifier =
    req.body.email || req.body.username || req.body.name || req.body.identifier;
  const { password } = req.body;

  // Accept email, username, name, or a generic identifier from the frontend
  const user = await authService.loginUser(identifier, password);
  if (!user.isEmailVerified) {
    return res.status(403).send({
      message: "Please verify your email address before logging in.",
    });
  }
  const userSpace = await userSpaceService.getSpace(user.id);
  user.profilePicture =
    userSpace?.profilePicture ||
    "https://musicimagevideos.s3.ap-southeast-2.amazonaws.com/music/others/685faf70bfcdd925769fa07a/1751101939604-Screen Shot 2025-06-28 at 16.12.06.png";
  user.name = userSpace
    ? userSpace?.firstName + " " + userSpace?.lastName
    : user.name;
  const tokens = await tokenService.generateAuthTokens(user);
  const isNewUser = userSpace ? false : true;
  res.send({ user, tokens, isNewUser });
});

const logout = catchAsync(async (req, res) => {
  await authService.logout(req.body.refreshToken);
  res.status(httpStatus.NO_CONTENT).send();
});

const refreshTokens = catchAsync(async (req, res) => {
  const tokens = await authService.refreshAuth(req.body.refreshToken);
  res.send({ ...tokens });
});

const forgotPassword = catchAsync(async (req, res) => {
  const resetPasswordToken = await tokenService.generateResetPasswordToken(
    req.body.email,
  );
  await emailService.sendResetPasswordEmail(req.body.email, resetPasswordToken);
  res.status(httpStatus.NO_CONTENT).send();
});

const resetPassword = catchAsync(async (req, res) => {
  await authService.resetPassword(req.query.token, req.body.password);
  res.status(httpStatus.NO_CONTENT).send();
});

const sendVerificationEmail = catchAsync(async (req, res) => {
  const verifyEmailToken = await tokenService.generateVerifyEmailToken(
    req.user,
  );
  await emailService.sendVerificationEmail(req.user.email, verifyEmailToken);
  res.status(httpStatus.NO_CONTENT).send();
});

const verifyEmail = catchAsync(async (req, res) => {
  const result = await authService.verifyEmail(req.query.token);
  res.redirect(`${config.frontend.url}/auth/login`);
});

const googleRegister = catchAsync(async (req, res) => {
  // Data dari frontend: { name, email, id, image }
  const { name, email, id, image } = req.body;
  if (!email || !id) {
    return res
      .status(httpStatus.BAD_REQUEST)
      .json({ message: "Email and Google ID are required" });
  }
  let user = await userService.getUserByEmail(email);
  if (!user) {
    // Buat user baru
    user = await userService.createUser({
      name,
      email,
      password: id + email, // password dummy, tidak dipakai
      isEmailVerified: true,
      profilePicture: image || "",
      noPassword: true,
    });
  }
  const userSpace = await userSpaceService.getSpace(user.id);
  const isNewUser = userSpace ? false : true;
  // Generate token
  const tokens = await tokenService.generateAuthTokens(user);
  console.log("Google user registered:", { user, tokens, isNewUser });
  res.status(httpStatus.OK).send({ user, tokens, isNewUser: isNewUser });
});

const changePassword = catchAsync(async (req, res) => {
  const userId = req.user.id;
  const { oldPassword, password } = req.body;
  const user = await userService.getUserById(userId);
  if (!user.noPassword) {
    if (!oldPassword) {
      return res
        .status(httpStatus.BAD_REQUEST)
        .send({ message: "Old password is required" });
    }
    const isMatch = await authService.loginUserWithEmailAndPassword(
      user.email,
      oldPassword,
    );
    if (!isMatch) {
      return res
        .status(httpStatus.BAD_REQUEST)
        .send({ message: "Old password is incorrect" });
    }
  }
  await userService.updateUserById(userId, { password, noPassword: false });
  res.status(httpStatus.OK).send({ message: "Password updated successfully" });
});

const forgotPasswordOTP = catchAsync(async (req, res) => {
  const { otp, user } = await authService.generateForgotPasswordOTP(
    req.body.email,
  );
  await emailService.sendResetPasswordOTPEmail(req.body.email, otp);
  res.status(httpStatus.OK).send({ message: "OTP sent to email" });
});

const resetPasswordOTP = catchAsync(async (req, res) => {
  await authService.verifyOTPAndResetPassword(
    req.body.email,
    req.body.otp,
    req.body.password,
  );
  res.status(httpStatus.OK).send({ message: "Password reset successfully" });
});

module.exports = {
  register,
  login,
  logout,
  refreshTokens,
  forgotPassword,
  resetPassword,
  sendVerificationEmail,
  verifyEmail,
  googleRegister,
  changePassword,
  forgotPasswordOTP,
  resetPasswordOTP,
};
