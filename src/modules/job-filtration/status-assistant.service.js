const axios = require("axios");
const config = require("../../config/config");
const Application = require("./filtration-application.model");
const { AppliedJobs } = require("../../models");
const { logAiRequest } = require("../../services/aiLogger.service");

const STATUS_TERMS = ["status", "application", "applied", "shortlist", "interview", "rejected", "hired", "test"];
const safeStatus = (application) => ({
  applicationId: String(application._id),
  jobTitle: application.job?.title || "Job application",
  jobType: application.job?.type,
  status: application.finalStatus,
  resumeStatus: application.resumeStatus,
  testStatus: application.testStatus,
  updatedAt: application.updatedAt,
  rejectionReason: application.finalStatus === "rejected" ? application.rejectionReason : undefined,
  improvementReport: application.finalStatus === "rejected" ? application.improvementReport : undefined,
});

const legacyStatus = (application) => {
  const statusMap = { manual_review: "under_review", test_pending: "test_unlocked", test_submitted: "test_completed", disqualified: "rejected" };
  const score = Number(application.matchScore ?? application.resumeMatchScore ?? 0);
  return {
    applicationId: String(application._id),
    jobTitle: application.jobId?.projectTitle || application.jobId?.position || application.jobId?.title || "Job application",
    jobType: application.jobId?.type,
    status: statusMap[application.screeningStatus] || (application.qualified ? "shortlisted" : "under_review"),
    resumeStatus: score >= 60 ? "passed" : "failed",
    testStatus: application.screeningStatus === "test_pending" ? "unlocked" : application.screeningStatus === "test_submitted" ? "completed" : "locked",
    updatedAt: application.updatedAt,
    rejectionReason: application.screeningStatus === "disqualified" ? application.disqualifiedReason : undefined,
  };
};

const localAnswer = (records) => {
  if (!records.length) return "I could not find a matching application in your account. I can only discuss applications owned by your signed-in account.";
  if (records.length === 1) {
    const record = records[0];
    return `Your application for ${record.jobTitle} is currently ${record.status.replaceAll("_", " ")}.`;
  }
  return `You have ${records.length} applications. Your most recently updated application is for ${records[0].jobTitle}, currently ${records[0].status.replaceAll("_", " ")}.`;
};

const geminiAnswer = async (message, records, userId) => {
  if (!config.gemini.apiKey) return null;
  const startedAt = Date.now();
  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.gemini.model)}:generateContent`,
      {
        systemInstruction: { parts: [{ text: "You are SynergyHire's candidate support assistant. Answer only from the supplied candidate-owned application data. Never infer or request another user's data. If the data does not answer the question, say so. Keep the answer under 120 words." }] },
        contents: [{ role: "user", parts: [{ text: `Question: ${message}\nCandidate-owned applications: ${JSON.stringify(records)}` }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 250 },
      },
      { headers: { "x-goog-api-key": config.gemini.apiKey }, timeout: 10000 },
    );
    const answer = response.data?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim();
    const usage = response.data?.usageMetadata || {};
    await logAiRequest({ userId, endpoint: "/api/assistant/status", model: config.gemini.model, promptTokens: usage.promptTokenCount || 0, completionTokens: usage.candidatesTokenCount || 0, totalTokens: usage.totalTokenCount || 0, latencyMs: Date.now() - startedAt, status: "success" });
    return answer || null;
  } catch (error) {
    await logAiRequest({ userId, endpoint: "/api/assistant/status", model: config.gemini.model, latencyMs: Date.now() - startedAt, status: "failed", errorMessage: error.message });
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
    Application.find(query).populate("job", "title type").sort({ updatedAt: -1 }).limit(id ? 1 : 10),
    AppliedJobs.find(legacyQuery).populate("jobId", "projectTitle position title type").sort({ updatedAt: -1 }).limit(id ? 1 : 10),
  ]);
  const records = [...applications.map(safeStatus), ...legacyApplications.map(legacyStatus)]
    .sort((left, right) => new Date(right.updatedAt || 0) - new Date(left.updatedAt || 0))
    .slice(0, id ? 1 : 10);
  const generated = records.length ? await geminiAnswer(message, records, userId) : null;
  return { intent: "application_status", answer: generated || localAnswer(records), applications: records };
};

module.exports = { answerStatusQuestion, safeStatus, legacyStatus };
