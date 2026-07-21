const express = require("express");
const auth = require("../../middlewares/auth");
const analyticsController = require("../../controllers/analytics.controller");

const router = express.Router();
router.get("/overview", auth("admin"), analyticsController.getAdminOverview);

module.exports = router;
