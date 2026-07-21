const httpStatus = require("http-status");
const pick = require("../utils/pick");
const ApiError = require("../utils/ApiError");
const catchAsync = require("../utils/catchAsync");
const { notificationService } = require("../services");

const getNotifications = catchAsync(async (req, res) => {
  const filter = pick(req.query, ["isRead", "type"]);
  if (filter.isRead !== undefined) filter.isRead = String(filter.isRead) === "true";
  const options = pick(req.query, ["sortBy", "limit", "page", "populate"]);
  const result = await notificationService.getUserNotifications(
    req.user.id,
    options,
  );
  res.send(result);
});

const markAsRead = catchAsync(async (req, res) => {
  const notification = await notificationService.markAsRead(
    req.params.notificationId,
    req.user.id,
  );
  res.send(notification);
});

const markAllAsRead = catchAsync(async (req, res) => {
  await notificationService.markAllAsRead(req.user.id);
  res.status(httpStatus.NO_CONTENT).send();
});
const getPreferences = catchAsync(async (req, res) => { const User = require("../models/user.model"); const user = await User.findById(req.user.id).select("notificationPreferences"); if (!user) throw new ApiError(httpStatus.NOT_FOUND, "User not found"); res.send(user.notificationPreferences || {}); });
const updatePreferences = catchAsync(async (req, res) => { const User = require("../models/user.model"); const allowed = ["applications", "tests", "interviews", "messages", "orders", "reviews", "email"]; const updates = {}; allowed.forEach((key) => { if (typeof req.body[key] === "boolean") updates[`notificationPreferences.${key}`] = req.body[key]; }); const user = await User.findByIdAndUpdate(req.user.id, { $set: updates }, { new: true, runValidators: true }).select("notificationPreferences"); if (!user) throw new ApiError(httpStatus.NOT_FOUND, "User not found"); res.send(user.notificationPreferences); });

module.exports = {
  getNotifications,
  markAsRead,
  markAllAsRead,
  getPreferences,
  updatePreferences,
};
