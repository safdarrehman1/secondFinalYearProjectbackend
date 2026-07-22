const screeningService = require("../applicant-screening/screening.service");
const axios = require("axios");
const config = require("../../config/config");

const clamp = (value) => Math.max(0, Math.min(100, Number(value) || 0));
const normalize = (value) => String(value || "").trim().toLowerCase();
const SCORING_VERSION = "resume-v1.1";

const keywordOverlap = (candidateSkills = [], requiredSkills = []) => {
  const candidate = new Set(candidateSkills.map(normalize).filter(Boolean));
  const required = [...new Set(requiredSkills.map(normalize).filter(Boolean))];
  if (!required.length) return 100;
  return (required.filter((skill) => candidate.has(skill)).length / required.length) * 100;
};

const matchExperience = (actual = 0, required = 0) =>
  required > 0 ? Math.min(100, (Number(actual || 0) / required) * 100) : 100;

const computeStability = (history = []) => {
  if (!Array.isArray(history) || !history.length) return 50;
  const months = history.map((item) => Number(item.durationMonths || 0)).filter((value) => value > 0);
  return months.length ? clamp((months.reduce((sum, value) => sum + value, 0) / months.length / 24) * 100) : 50;
};

const scoreResume = async (resumeText, job) => {
  let parsed; let provider = "gemini"; let confidence = 0.9; let explanation = "Resume parsed and scored using structured AI extraction.";
  try { parsed = await screeningService.parseResume(resumeText, job.description); }
  catch (error) {
    provider = "local_fallback"; confidence = 0.25; explanation = `AI parsing unavailable; manual review required (${error.message})`;
    const normalizedText = normalize(resumeText);
    const knownSkills = job.gigDetails?.skillsRequired || job.fullTimeDetails?.skillsRequired || [];
    parsed = { skills: knownSkills.filter((skill) => normalizedText.includes(normalize(skill))), years: 0, workHistory: [], matchScore: 0, requiredSkillsFromJD: knownSkills };
  }
  const requiredSkills = job.type === "gig"
    ? job.gigDetails?.skillsRequired || []
    : parsed.requiredSkillsFromJD || [];
  const skillScore = keywordOverlap(parsed.skills, requiredSkills);
  const experienceScore = job.type === "full_time"
    ? matchExperience(parsed.years || parsed.experienceYears, job.fullTimeDetails?.experienceRequiredYears)
    : 0;
  const stabilityScore = job.type === "full_time" ? computeStability(parsed.workHistory) : 0;
  const raw = clamp(parsed.matchScore);
  const config = job.scoringConfig;
  const weighted = clamp(
    skillScore * config.skillWeight +
    experienceScore * config.experienceWeight +
    stabilityScore * config.stabilityWeight,
  );
  return { raw, weighted, breakdown: { skillScore, experienceScore, stabilityScore }, parsed, provider, model: provider === "gemini" ? config.gemini.model : "deterministic-keyword", scoringVersion: SCORING_VERSION, confidence, explanation, requiresManualReview: confidence < 0.5 };
};

const scoreMcq = (test, answers) => {
  const answerMap = new Map((answers || []).map((answer) => [String(answer.questionId), String(answer.response || "")]));
  const correct = test.questions.reduce(
    (total, question) => total + (answerMap.get(String(question._id)) === question.correctAnswer ? 1 : 0), 0,
  );
  return { score: test.questions.length ? Math.round((correct / test.questions.length) * 100) : 0, justification: `${correct}/${test.questions.length} correct` };
};

const scoreTask = async (test, answers, userId = null) => {
  if (!config.gemini.apiKey) return { score: null, justification: "Task requires manual review because AI scoring is not configured", requiresManualReview: true };
  const { logAiRequest } = require("../../services/aiLogger.service");
  const startTime = Date.now();
  const endpoint = "/v1/applications/score-task";
  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.gemini.model)}:generateContent`,
      {
        contents: [{ role: "user", parts: [{ text: `Score this task submission using only the supplied rubric. Return JSON {"score":0,"justification":"short reason"}.\nTasks: ${JSON.stringify(test.questions)}\nAnswers: ${JSON.stringify(answers)}` }] }],
        generationConfig: { temperature: 0, responseMimeType: "application/json", maxOutputTokens: 500 },
      },
      { headers: { "x-goog-api-key": config.gemini.apiKey }, timeout: 15000 },
    );
    const text = response.data?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("");
    const parsed = JSON.parse(text || "{}");
    const usage = response.data.usageMetadata || {};
    const latencyMs = Date.now() - startTime;

    logAiRequest({
      userId,
      endpoint,
      model: config.gemini.model,
      promptTokens: usage.promptTokenCount || 0,
      completionTokens: usage.candidatesTokenCount || 0,
      totalTokens: usage.totalTokenCount || 0,
      latencyMs,
      status: "success",
    });

    return { score: clamp(parsed.score), justification: String(parsed.justification || "AI rubric score").slice(0, 1000), requiresManualReview: false };
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    logAiRequest({
      userId,
      endpoint,
      model: config.gemini.model,
      latencyMs,
      status: "failed",
      errorMessage: error.message,
    });
    return { score: null, justification: `Task requires manual review because automated scoring failed: ${error.message}`, requiresManualReview: true };
  }
};

module.exports = { scoreResume, scoreMcq, scoreTask, keywordOverlap, matchExperience, computeStability, SCORING_VERSION };
