const Application = require("./filtration-application.model");
const AppliedJobs = require("../../models/appliedJobs.model");
const aiService = require("../../services/aiService");

const STATUS_TERMS = [
  "status", "update", "application", "test", "interview", "result",
  "score", "screening", "job", "hired", "rejected", "shortlisted", "progress"
];

const safeStatus = (app) => ({
  id: String(app._id || app.id),
  jobId: String(app.job?._id || app.job?.id || app.job || ""),
  jobTitle: app.job?.title || app.job?.projectTitle || app.job?.position || "Job Position",
  jobType: app.job?.type || "job",
  finalStatus: app.finalStatus || "under_review",
  resumeStatus: app.resumeStatus || "pending",
  resumeScore: typeof app.resumeScore === "object" ? app.resumeScore?.weighted : app.resumeScore || null,
  testStatus: app.testStatus || "not_started",
  testScore: app.testScore || null,
  updatedAt: app.updatedAt || app.createdAt || new Date()
});

const legacyStatus = (app) => ({
  id: String(app._id || app.id),
  jobId: String(app.jobId?._id || app.jobId?.id || app.jobId || ""),
  jobTitle: app.jobId?.projectTitle || app.jobId?.position || app.jobId?.title || "Job Position",
  jobType: "legacy_job",
  finalStatus: app.screeningStatus || (app.qualified ? "shortlisted" : "under_review"),
  resumeStatus: "passed",
  resumeScore: null,
  testStatus: app.screeningStatus || "completed",
  testScore: app.questionnaireScore || null,
  updatedAt: app.updatedAt || app.createdAt || new Date()
});

const localAnswer = (records) => {
  if (!records || records.length === 0) {
    return "You currently have no active job applications found.";
  }
  const latest = records[0];
  return `Your application for "${latest.jobTitle}" is currently in "${latest.finalStatus.replace(/_/g, " ")}" status.`;
};

const geminiAnswer = async (message, records, userId) => {
  try {
    const result = await aiService.generateContent(
      "You are SynergyHire's candidate support assistant. Answer only from the supplied candidate-owned application data. Never infer or request another user's data. If the data does not answer the question, say so. Keep the answer under 120 words.",
      `Question: ${message}\nCandidate-owned applications: ${JSON.stringify(records)}`,
      { temperature: 0.2, maxOutputTokens: 250, timeout: 10000 },
      userId,
      "/api/assistant/status"
    );
    return result.text ? result.text.trim() : null;
  } catch (error) {
    return null;
  }
};

const answerStatusQuestion = async ({ userId, message }) => {
  const normalized = String(message || "").trim().toLowerCase();
  const looksLikeStatusQuestion = STATUS_TERMS.some((term) => normalized.includes(term));
  if (!looksLikeStatusQuestion) {
    return { intent: "unclear", answer: "I can help with your application status, resume screening result, test stage, interview stage, or improvement report. Please ask about one of those topics.", applications: [] };
  }

  const id = normalized.match(/\b[a-f0-9]{24}\b/i)?.[0];
  const query = { candidate: userId, ...(id ? { _id: id } : {}) };
  const legacyQuery = { createdBy: userId, ...(id ? { _id: id } : {}) };
  const [applications, legacyApplications] = await Promise.all([
    Application.find(query).populate("job", "title type projectTitle position").sort({ updatedAt: -1 }).limit(id ? 1 : 10),
    AppliedJobs.find(legacyQuery).populate("jobId", "projectTitle position title type").sort({ updatedAt: -1 }).limit(id ? 1 : 10),
  ]);
  const records = [...applications.map(safeStatus), ...legacyApplications.map(legacyStatus)]
    .sort((left, right) => new Date(right.updatedAt || 0) - new Date(left.updatedAt || 0))
    .slice(0, id ? 1 : 10);
  const generated = records.length ? await geminiAnswer(message, records, userId) : null;
  return { intent: "application_status", answer: generated || localAnswer(records), applications: records };
};

module.exports = { answerStatusQuestion, safeStatus, legacyStatus };
