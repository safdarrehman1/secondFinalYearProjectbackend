const axios = require("axios");
const path = require("path");
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");
const WordExtractor = require("word-extractor");
const config = require("../config/config");
const screeningService = require("../modules/applicant-screening/screening.service");

const wordExtractor = new WordExtractor();

const aiJsonCall = async (systemInstruction, prompt, maxOutputTokens = 2500, temperature = 0.3, userId = null, endpoint = "unknown") => {
  if (!config.gemini.apiKey) {
    throw new Error("Gemini API key is not configured");
  }
  const { logAiRequest } = require("./aiLogger.service");
  const startTime = Date.now();

  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.gemini.model)}:generateContent`,
      {
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature, maxOutputTokens, responseMimeType: "application/json" },
      },
      { headers: { "x-goog-api-key": config.gemini.apiKey }, timeout: 20000 }
    );

    const text = response.data?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("");
    if (!text) throw new Error("AI returned no content");

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

    return JSON.parse(text);
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
    throw error;
  }
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

  if (config.gemini.apiKey) {
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
  const jobTitle = job.projectTitle || job.position || "Role";
  const requiredSkills = (job.requiredSkills || []).join(", ");
  const description = String(job.description || "").slice(0, 5000);
  const applicantSkills = (parsedResume?.skills || []).join(", ");
  const applicantSummary = String(parsedResume?.aboutSummary || "").slice(0, 2000);

  const prompt = `Create a 5-8 question screening assessment for this job applicant.
Job Title: ${jobTitle}
Required Skills: ${requiredSkills}
Job Description: ${description}
Applicant Resume Summary: ${applicantSummary}
Applicant Claimed Skills: ${applicantSkills}

Instructions:
Generate between 5 and 8 questions:
1. 4 to 6 technical and scenario questions (MCQ type with 4 options each) based on the job requirements.
2. 1 to 2 resume-probing questions (text type or MCQ) that specifically test concrete evidence for claims made in the applicant's resume. Set expectedSignal describing what a strong answer demonstrates.

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
  try {
    const result = await aiJsonCall(
      "You are an expert technical interviewer crafting tailored pre-screening tests. Return valid JSON only.",
      prompt,
      3000,
      0.5,
      userId,
      "/v1/applications/screening-test"
    );
    rawQuestions = Array.isArray(result.questions) ? result.questions : [];
  } catch (err) {
    console.warn("AI screening test generation fallback:", err.message);
  }

  if (rawQuestions.length === 0) {
    rawQuestions = [
      {
        id: "q1",
        prompt: `How many years of hands-on experience do you have with ${requiredSkills || jobTitle}?`,
        type: "mcq",
        options: ["Less than 1 year", "1-3 years", "3-5 years", "5+ years"],
        correctAnswer: "3-5 years",
        expectedSignal: "Verifies overall experience depth"
      },
      {
        id: "q2",
        prompt: `Which approach do you follow to ensure code quality and performance in ${jobTitle} projects?`,
        type: "mcq",
        options: [
          "Automated unit testing, linting, and continuous integration",
          "Manual spot checking only before deployment",
          "Relying solely on user feedback in production",
          "Skipping code reviews to ship faster"
        ],
        correctAnswer: "Automated unit testing, linting, and continuous integration",
        expectedSignal: "Assesses engineering best practices"
      },
      {
        id: "q3",
        prompt: `Describe a challenging problem you solved in your past projects related to ${requiredSkills || jobTitle}.`,
        type: "text",
        options: [],
        correctAnswer: "",
        expectedSignal: "Substantiates practical problem-solving capability"
      },
      {
        id: "q4",
        prompt: `How do you handle strict project deadlines and shifting requirements?`,
        type: "mcq",
        options: [
          "Prioritize core functionality, communicate transparently with stakeholders, and execute iteratively",
          "Ignore changing requirements and stick strictly to initial design",
          "Delay the deliverable indefinitely without notifying the team",
          "Cut corners on core security and data validation"
        ],
        correctAnswer: "Prioritize core functionality, communicate transparently with stakeholders, and execute iteratively",
        expectedSignal: "Evaluates agile mindset and project management"
      },
      {
        id: "q5",
        prompt: `Briefly explain the architecture of a project you built using ${applicantSkills || requiredSkills || "modern frameworks"}.`,
        type: "text",
        options: [],
        correctAnswer: "",
        expectedSignal: "Validates architecture design claims on resume"
      }
    ];
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

  if (config.gemini.apiKey) {
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
  scoreMatch,
  generateScreeningTest,
  evaluateTestAnswers,
};
