const httpStatus = require("http-status");
const pick = require("../utils/pick");
const ApiError = require("../utils/ApiError");
const catchAsync = require("../utils/catchAsync");
const { notificationService } = require("../services");

const getNotifications = catchAsync(async (req, res) => {
  const filter = pick(req.query, []);
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

module.exports = {
  getNotifications,
  markAsRead,
  markAllAsRead,
};
