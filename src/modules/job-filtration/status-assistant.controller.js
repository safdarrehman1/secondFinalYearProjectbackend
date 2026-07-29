const { successResponse } = require("../../utils/response");
const auditService = require("../../services/audit.service");
const assistantService = require("./status-assistant.service");

exports.ask = async (req, res) => {
  let outcome = "success";
  try {
    const result = await assistantService.answerStatusQuestion({ userId: req.user.id, message: req.body.message });
    await auditService.record({ actor: req.user.id, action: "status_assistant.query", resourceType: "candidate_applications", outcome, metadata: { intent: result.intent, returnedApplications: result.applications.length }, request: req });
    return successResponse(res, result, "Assistant response");
  } catch (error) {
    outcome = "failure";
    await auditService.record({ actor: req.user.id, action: "status_assistant.query", resourceType: "candidate_applications", outcome, metadata: { error: error.message }, request: req }).catch(() => undefined);
    throw error;
  }
};
