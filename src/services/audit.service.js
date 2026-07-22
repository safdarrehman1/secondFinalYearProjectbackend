const AuditLog = require("../models/auditLog.model");

const record = async ({
  actor,
  action,
  resourceType,
  resourceId,
  outcome = "success",
  metadata = {},
  request,
}) =>
  AuditLog.create({
    actor,
    action,
    resourceType,
    resourceId: resourceId ? String(resourceId) : undefined,
    outcome,
    metadata,
    ipAddress: request?.ip,
    userAgent: request?.get?.("user-agent"),
  });

const list = async (filters = {}) => {
  const page = Math.max(Number.parseInt(filters.page, 10) || 1, 1);
  const limit = Math.min(
    Math.max(Number.parseInt(filters.limit, 10) || 25, 1),
    100,
  );
  const query = {};
  for (const key of ["actor", "action", "resourceType", "resourceId", "outcome"]) {
    if (filters[key]) query[key] = filters[key];
  }
  if (filters.from || filters.to) {
    query.createdAt = {};
    if (filters.from) query.createdAt.$gte = new Date(filters.from);
    if (filters.to) query.createdAt.$lte = new Date(filters.to);
  }

  const [items, total] = await Promise.all([
    AuditLog.find(query)
      .populate("actor", "name email role")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    AuditLog.countDocuments(query),
  ]);
  return {
    items,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

module.exports = { record, list };
