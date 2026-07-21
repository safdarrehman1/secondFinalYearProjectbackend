const asyncHandler = require("../utils/asyncHandler");
const analyticsService = require("../services/analytics.service");
const { successResponse } = require("../utils/response");

const getAdminOverview = asyncHandler(async (req, res) => {
  const data = await analyticsService.getAdminOverview(req.query);
  return successResponse(res, data, "Analytics overview retrieved");
});

module.exports = { getAdminOverview };
