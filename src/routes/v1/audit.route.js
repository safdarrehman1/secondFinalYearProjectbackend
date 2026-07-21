const express = require("express");
const auth = require("../../middlewares/auth");
const auditController = require("../../controllers/audit.controller");

const router = express.Router();

router.get("/", auth("admin"), auditController.listAuditLogs);

module.exports = router;
