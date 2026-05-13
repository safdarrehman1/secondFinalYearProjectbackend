const express = require("express");
const auth = require("../../middlewares/auth");
const notificationController = require("../../controllers/notification.controller");

const router = express.Router();

router.route("/").get(auth(), notificationController.getNotifications);

router.route("/read-all").patch(auth(), notificationController.markAllAsRead);

router
  .route("/:notificationId/read")
  .patch(auth(), notificationController.markAsRead);

module.exports = router;
