const axios = require("axios");
const path = require("path");
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");
const WordExtractor = require("word-extractor");
const config = require("../config/config");
const aiService = require("./aiService");
const screeningService = require("../modules/applicant-screening/screening.service");
const { namesMatch, validateResumeDocument } = require("../utils/resumeValidation");
const { Application } = require("../models");

const wordExtractor = new WordExtractor();

const aiJsonCall = async (systemInstruction, prompt, maxOutputTokens = 2500, temperature = 0.3, userId = null, endpoint = "unknown") => {
  return aiService.generateJson(
    systemInstruction,
    prompt,
    { maxOutputTokens, temperature },
    userId,
    endpoint
  );
};

const extractResumeText = async (file) => {
  if (!file || !file.buffer) {
    throw new Error("A resume file is required");
  }

  const extension = path.extname(file.originalname || "").toLowerCase();

  if (extension === ".txt") {
    return file.buffer.toString("utf8");
  }

  if (extension === ".pdf") {
    const result = await pdfParse(file.buffer);
    return result.text;
  }

  if (extension === ".docx") {
    const result = await mammoth.extractRawText({ buffer: file.buffer });
    return result.value;
  }

  if (extension === ".doc") {
    const document = await wordExtractor.extract(file.buffer);
    return document.getBody();
  }

  throw new Error("Unsupported resume format. Upload a PDF, DOC, DOCX, or TXT file.");
};

const parseResume = async (resumeText, jobDescription = "", userId = null) => {
  if (!resumeText || resumeText.trim().length < 50) {
    throw new Error("Resume text is too short or empty.");
  }
  return screeningService.parseResume(resumeText, jobDescription, userId);
};

const validateResumeAuthenticity = async (resumeText, accountName, userId = null) => {
  validateResumeDocument({ text: resumeText, accountName });
  if (config.aiProvider === "groq" ? !config.groq.apiKey : !config.gemini.apiKey) return true;

  let result;
  try {
    result = await aiJsonCall(
      "Classify uploaded hiring documents conservatively. Never treat a proposal, cover letter, job description, portfolio-only document, invoice, or certificate as a resume.",
      `Review this uploaded document and return JSON only: {"is_resume":true,"candidate_name":"Full name exactly as written","reason":"brief reason"}. A resume must primarily describe one candidate's contact details, work history, education and/or skills.\n\nDocument:\n${String(resumeText).slice(0, 12000)}`,
      500,
      0,
      userId,
      "/v1/applications/validate-resume-document",
    );
  } catch (error) {
    console.warn("AI resume validation unavailable, using local validation:", error.message);
    return true;
  }
  if (result.is_resume !== true) {
    throw new Error(`The uploaded file is not a resume${result.reason ? `: ${result.reason}` : "."}`);
  }
  if (!result.candidate_name || !namesMatch(accountName, result.candidate_name)) {
    throw new Error(`The resume candidate name does not match the signed-in account (${accountName}). Upload your own resume.`);
  }
  return true;
};

const scoreMatch = async (parsedResume, job, resumeText = "") => {
  const jobTitle = job.projectTitle || job.position || "";
  const reqSkills = Array.isArray(job.requiredSkills) && job.requiredSkills.length > 0
    ? job.requiredSkills
    : (job.category || []);

  const parsedSkills = Array.isArray(parsedResume?.skills) ? parsedResume.skills : [];
  const parsedProjects = Array.isArray(parsedResume?.projects) ? parsedResume.projects : [];

  let matchScore = parsedResume?.matchScore || 0;
  let embeddingMismatch = false;
  let cooldownViolation = false;
  let evidenceSubstantiated = parsedProjects.length > 0;

  if (config.aiProvider === "groq" ? config.groq.apiKey : config.gemini.apiKey) {
    try {
      const evaluation = await aiJsonCall(
        "You are an objective AI resume screening analyst. Compare the applicant's resume facts with the job requirements.",
        `Job Title: ${jobTitle}\nRequired Skills: ${reqSkills.join(", ")}\nJob Description: ${String(job.description || "").slice(0, 5000)}\n\nApplicant Resume Summary: ${parsedResume?.aboutSummary || ""}\nApplicant Skills: ${parsedSkills.join(", ")}\nApplicant Projects: ${JSON.stringify(parsedProjects)}\n\nEvaluate:\n1. match_score (0-100)\n2. embedding_mismatch (boolean: true if applicant claims skills unsupported by experience/projects)\n3. evidence_substantiated (boolean: true if skills are substantiated by concrete projects/outcomes)\n4. cooldown_violation (boolean: true if resume exhibits keyword stuffing without evidence)\n\nReturn JSON in exact format: {"match_score": 75, "embedding_mismatch": false, "evidence_substantiated": true, "cooldown_violation": false}`
      );
      matchScore = Math.max(0, Math.min(100, Math.round(Number(evaluation.match_score) || matchScore)));
      embeddingMismatch = Boolean(evaluation.embedding_mismatch);
      evidenceSubstantiated = Boolean(evaluation.evidence_substantiated);
      cooldownViolation = Boolean(evaluation.cooldown_violation);
    } catch (err) {
      console.warn("AI match scoring fallback to local heuristics:", err.message);
    }
  }

  // Local heuristic scoring fallback if matchScore is 0 or AI call falls back
  if (matchScore === 0) {
    const fullText = (resumeText + " " + parsedSkills.join(" ") + " " + (parsedResume?.aboutSummary || "")).toLowerCase();
    const targets = reqSkills.length > 0 ? reqSkills : [jobTitle, job.designCategory || ""].filter(Boolean);

    if (targets.length > 0) {
      let matchedCount = 0;
      targets.forEach((skill) => {
        if (skill && fullText.includes(skill.toLowerCase().trim())) {
          matchedCount += 1;
        }
      });
      const ratio = matchedCount / targets.length;
      matchScore = Math.max(55, Math.min(95, Math.round(ratio * 40 + 55)));
    } else {
      matchScore = 75;
    }
  }

  return {
    matchScore,
    gamingFlags: {
      embeddingMismatch,
      cooldownViolation,
      evidenceSubstantiated,
    },
  };
};

const generateScreeningTest = async (parsedResume, job, userId = null) => {
  // Feature 1: Manual Question Source Check
  if (job && job.questionSource === "manual") {
    const rawCustom = (Array.isArray(job.customQuestions) && job.customQuestions.length > 0)
      ? job.customQuestions
      : (Array.isArray(job.test?.questions) ? job.test.questions : []);

    if (rawCustom.length === 0) {
      throw new Error("This job is set to manual question mode but has no custom questions configured.");
    }

    return rawCustom.map((q, idx) => ({
      id: `q${idx + 1}`,
      prompt: String(q.questionText || q.prompt || "").trim(),
      type: q.type === "text" ? "text" : "mcq",
      options: Array.isArray(q.options) ? q.options.map(String) : [],
      correctAnswer: String(q.correctAnswer || q.correct_answer || "").trim(),
      expectedSignal: "Company custom question",
    }));
  }

  const jobTitle = job.projectTitle || job.position || "Role";
  const requiredSkills = (job.requiredSkills || []).join(", ");
  const description = String(job.description || "").slice(0, 5000);
  const applicantSkills = (parsedResume?.skills || []).join(", ");
  const applicantSummary = String(parsedResume?.aboutSummary || "").slice(0, 2000);
  const applicantProjects = JSON.stringify(parsedResume?.projects || []).slice(0, 3500);
  const variant = require("crypto").createHash("sha256")
    .update(`${userId || "anonymous"}:${job.id || job._id}:${applicantSummary}:${applicantProjects}`)
    .digest("hex").slice(0, 16);
  const previousApplications = job.id || job._id
    ? await Application.find({ job: job.id || job._id, applicant: { $ne: userId } })
      .select("test.questions.prompt")
      .sort({ createdAt: -1 })
      .limit(20)
      .lean()
    : [];
  const previousPrompts = new Set(previousApplications.flatMap((application) =>
    (application.test?.questions || []).map((question) => String(question.prompt || "").trim().toLowerCase()).filter(Boolean)));
  const promptExclusions = [...previousPrompts].slice(0, 40);

  const prompt = `Create a 5-8 question screening assessment for this job applicant.
Job Title: ${jobTitle}
Required Skills: ${requiredSkills}
Job Description: ${description}
Applicant Resume Summary: ${applicantSummary}
Applicant Claimed Skills: ${applicantSkills}
Applicant Projects: ${applicantProjects}
Unique applicant assessment variant: ${variant}

Instructions:
Generate between 5 and 8 questions:
1. 4 to 6 technical and scenario questions (MCQ type with 4 options each) based on the job requirements.
2. 1 to 2 resume-probing questions (text type or MCQ) that specifically test concrete evidence for claims made in the applicant's resume. Set expectedSignal describing what a strong answer demonstrates.
3. Make the questions specific to this applicant's projects, experience, and evidence. Do not return a stock or reusable question set. The variant must result in a distinct assessment for this applicant.
4. Do not repeat any of these questions previously used for this job: ${JSON.stringify(promptExclusions)}

Return JSON in this exact structure:
{
  "questions": [
    {
      "id": "q1",
      "prompt": "Question text...",
      "type": "mcq",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctAnswer": "Option A",
      "expectedSignal": "Validates hands-on knowledge of..."
    },
    {
      "id": "q5",
      "prompt": "Describe how you implemented X in your previous project...",
      "type": "text",
      "options": [],
      "correctAnswer": "",
      "expectedSignal": "Demonstrates actual architecture design experience"
    }
  ]
}`;

  let rawQuestions = [];
  let generationError;
  for (let attempt = 0; attempt < 2 && rawQuestions.length < 5; attempt += 1) {
    try {
      const result = await aiJsonCall(
        "You are an expert technical interviewer crafting original, applicant-specific pre-screening tests. Return valid JSON only.",
        `${prompt}\nGeneration attempt variant: ${variant}-${attempt + 1}`,
        3000,
        0.7,
        userId,
        "/v1/applications/screening-test"
      );
      const candidateQuestions = Array.isArray(result.questions) ? result.questions : [];
      const uniquePrompts = new Set(candidateQuestions.map((question) => String(question.prompt || "").trim().toLowerCase()).filter(Boolean));
      const repeatsPreviousQuestion = [...uniquePrompts].some((question) => previousPrompts.has(question));
      if (candidateQuestions.length >= 5 && uniquePrompts.size === candidateQuestions.length && !repeatsPreviousQuestion) rawQuestions = candidateQuestions;
    } catch (err) {
      generationError = err;
    }
  }
  if (rawQuestions.length < 5) {
    throw generationError || new Error("AI did not generate a valid applicant-specific assessment");
  }

  const questions = rawQuestions.slice(0, 8).map((q, idx) => ({
    id: `q${idx + 1}`,
    prompt: String(q.prompt || "").trim(),
    type: q.type === "text" ? "text" : "mcq",
    options: Array.isArray(q.options) ? q.options.map(String) : [],
    correctAnswer: String(q.correctAnswer || "").trim(),
    expectedSignal: String(q.expectedSignal || "").trim(),
  }));

  return questions;
};

const evaluateTestAnswers = async (testQuestions, answers, userId = null) => {
  const answerMap = new Map((answers || []).map((a) => [String(a.questionId), String(a.answer || "")]));
  let mcqTotal = 0;
  let mcqCorrect = 0;

  testQuestions.forEach((q) => {
    if (q.type === "mcq" && q.correctAnswer) {
      mcqTotal += 1;
      const userAns = answerMap.get(String(q.id));
      if (userAns && userAns.toLowerCase().trim() === q.correctAnswer.toLowerCase().trim()) {
        mcqCorrect += 1;
      }
    }
  });

  let mcqScore = mcqTotal > 0 ? Math.round((mcqCorrect / mcqTotal) * 100) : 100;
  let evaluationScore = mcqScore;
  let feedback = `Answered ${mcqCorrect} out of ${mcqTotal} multiple-choice questions correctly.`;

  if (config.aiProvider === "groq" ? config.groq.apiKey : config.gemini.apiKey) {
    try {
      const prompt = `Evaluate the following test submission:
Questions and Answers:
${testQuestions
  .map((q) => `Q (${q.type}): ${q.prompt}\nExpected Signal: ${q.expectedSignal}\nApplicant Answer: ${answerMap.get(String(q.id)) || "No answer"}`)
  .join("\n\n")}

Provide an overall score (0-100) and a concise evaluation summary (2-3 sentences).
Return JSON: {"score": 85, "feedback": "Demonstrated strong knowledge of core principles..."}`;

      const aiEval = await aiJsonCall(
        "You are an expert hiring evaluator scoring candidate technical screening tests.",
        prompt,
        1000,
        0.2,
        userId,
        "/v1/applications/evaluate-test"
      );

      evaluationScore = Math.max(0, Math.min(100, Math.round(Number(aiEval.score) || mcqScore)));
      feedback = String(aiEval.feedback || feedback).trim();
    } catch (err) {
      console.warn("AI test evaluation fallback to MCQ score:", err.message);
    }
  }

  return {
    score: evaluationScore,
    feedback,
  };
};

module.exports = {
  extractResumeText,
  parseResume,
  validateResumeAuthenticity,
  scoreMatch,
  generateScreeningTest,
  evaluateTestAnswers,
};
