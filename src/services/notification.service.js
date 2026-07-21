const httpStatus = require("http-status");
const { Notification, User } = require("../models");
const ApiError = require("../utils/ApiError");
const emailService = require("./email.service");

/**
 * Create a notification
 * @param {Object} notificationBody
 * @returns {Promise<Notification>}
 */
const createNotification = async (
  type,
  receiver,
  sender,
  message,
  data = {},
) => {
  const preferenceByType = { application_status: "applications", job_application: "applications", test_status: "tests", interview_update: "interviews", message_received: "messages", order_message: "messages", order_review: "reviews", review_reply: "reviews" };
  const preference = preferenceByType[type];
  let receiverUser;
  if (preference) { receiverUser = await User.findById(receiver).select(`email notificationPreferences.${preference} notificationPreferences.email`).lean(); if (receiverUser?.notificationPreferences?.[preference] === false) return null; }
  const payload = { type, receiver, sender, message, data, dedupeKey: data.dedupeKey };
  const notification = data.dedupeKey
    ? await Notification.findOneAndUpdate({ dedupeKey: data.dedupeKey }, { $setOnInsert: payload }, { new: true, upsert: true, setDefaultsOnInsert: true })
    : await Notification.create(payload);
  if (preference && receiverUser?.notificationPreferences?.email !== false && receiverUser?.email) emailService.sendEmail(receiverUser.email, "Intelligent Hiring update", message, `<p>${String(message).replace(/[<>&]/g, "")}</p>`).catch(() => undefined);
  return notification;
};

/**
 * Query for notifications
 * @param {Object} filter - Mongo filter
 * @param {Object} options - Query options
 * @param {string} [options.sortBy] - Sort option in the format: sortField:(desc|asc)
 * @param {number} [options.limit] - Maximum number of results per page (default = 10)
 * @param {number} [options.page] - Current page (default = 1)
 * @returns {Promise<QueryResult>}
 */
const queryNotifications = async (filter, options) => {
  const notifications = await Notification.paginate(filter, options);
  return notifications;
};

/**
 * Get notification by id
 * @param {ObjectId} id
 * @returns {Promise<Notification>}
 */
const getNotificationById = async (id) => {
  return Notification.findById(id);
};

/**
 * Mark notification as read
 * @param {ObjectId} notificationId
 * @param {ObjectId} userId - User requesting the update (to ensure ownership)
 * @returns {Promise<Notification>}
 */
const markAsRead = async (notificationId, userId) => {
  const notification = await getNotificationById(notificationId);
  if (!notification) {
    throw new ApiError(httpStatus.NOT_FOUND, "Notification not found");
  }
  if (notification.receiver.toString() !== userId.toString()) {
    throw new ApiError(httpStatus.FORBIDDEN, "Forbidden");
  }
  Object.assign(notification, { isRead: true });
  await notification.save();
  return notification;
};

/**
 * Mark all notifications as read for a user
 * @param {ObjectId} userId
 * @returns {Promise<void>}
 */
const markAllAsRead = async (userId) => {
  await Notification.updateMany(
    { receiver: userId, isRead: false },
    { $set: { isRead: true } },
  );
};

/**
 * Get user notifications
 * @param {ObjectId} userId
 * @param {Object} options
 * @returns {Promise<QueryResult>}
 */
const getUserNotifications = async (userId, options) => {
  const filter = { receiver: userId };
  // Default sort by createdAt desc if not provided
  if (!options.sortBy) {
    options.sortBy = "createdAt:desc";
  }
  return queryNotifications(filter, options);
};

module.exports = {
  createNotification,
  queryNotifications,
  getNotificationById,
  markAsRead,
  markAllAsRead,
  getUserNotifications,
};
