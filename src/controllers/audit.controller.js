const asyncHandler = require("../utils/asyncHandler");
const auditService = require("../services/audit.service");
const { successResponse } = require("../utils/response");

const listAuditLogs = asyncHandler(async (req, res) => {
  const result = await auditService.list(req.query);
  return successResponse(res, result, "Audit logs retrieved");
});

module.exports = { listAuditLogs };
