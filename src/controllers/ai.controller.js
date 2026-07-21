const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const axios = require('axios');
const config = require('../config/config');
const jwt = require('jsonwebtoken');
const path = require('path');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const WordExtractor = require('word-extractor');
const { Job } = require('../models');
const screeningService = require('../modules/applicant-screening/screening.service');
const { uploadFileToS3 } = require('../utils/s3Upload');
const { logAiRequest } = require('../services/aiLogger.service');

const generateGeminiContent = async (systemInstruction, prompt, generationConfig = {}, userId = null, endpoint = "unknown") => {
  if (!config.gemini.apiKey) {
    throw new Error('Gemini API key is not configured');
  }

  const startTime = Date.now();
  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.gemini.model)}:generateContent`,
      {
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: config.gemini.temperature,
          maxOutputTokens: config.gemini.maxTokens,
          responseMimeType: 'application/json',
          ...generationConfig,
        },
      },
      { headers: { 'x-goog-api-key': config.gemini.apiKey } },
    );

    const text = response.data?.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || '')
      .join('');
    if (!text) throw new Error('Invalid AI response: no content returned');

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
      status: 'success',
    });

    return { text, usage };
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    logAiRequest({
      userId,
      endpoint,
      model: config.gemini.model,
      latencyMs,
      status: 'failed',
      errorMessage: error.message,
    });
    throw error;
  }
};

const wordExtractor = new WordExtractor();
const MAX_RESUME_CHARACTERS = 18000;
const MAX_LOCAL_DESCRIPTION_TERMS = 18;
const STOP_WORDS = new Set([
  'and', 'are', 'for', 'from', 'have', 'into', 'job', 'our', 'that', 'the',
  'their', 'this', 'with', 'will', 'you', 'your', 'years', 'work', 'role',
  'candidate', 'skills', 'experience', 'required', 'preferred', 'looking',
  'team', 'using', 'build', 'develop', 'developer', 'engineering', 'engineer',
]);

const extractResumeText = async (file) => {
  if (!file) {
    throw new Error('A resume file is required');
  }

  const extension = path.extname(file.originalname).toLowerCase();

  if (extension === '.txt') {
    return file.buffer.toString('utf8');
  }

  if (extension === '.pdf') {
    const result = await pdfParse(file.buffer);
    return result.text;
  }

  if (extension === '.docx') {
    const result = await mammoth.extractRawText({ buffer: file.buffer });
    return result.value;
  }

  if (extension === '.doc') {
    const document = await wordExtractor.extract(file.buffer);
    return document.getBody();
  }

  throw new Error('Unsupported resume format. Upload a PDF, DOC, DOCX, or TXT file.');
};

const getOutcome = (score) => {
  if (score < 30) return 'rejected';
  if (score <= 60) return 'needs_improvement';
  return 'eligible';
};

const getSignificantTokens = (value) => String(value || '')
  .toLowerCase()
  .replace(/[^a-z0-9+#.]+/g, ' ')
  .split(/\s+/)
  .map((token) => token.replace(/^\.+|\.+$/g, ''))
  .filter((token) => token.length >= 2 && !STOP_WORDS.has(token));

const buildLocalSuggestion = (score, outcome, missingSkills) => {
  const gapText = missingSkills.length > 0
    ? missingSkills.join(', ')
    : 'the most important role-specific requirements';

  if (outcome === 'rejected') {
    return `Your resume currently has a ${score}% match with this job and does not demonstrate enough of the required experience. Before applying, improve your resume and skills in ${gapText}, then add clear examples of projects, tools, and measurable results that show how you used those skills in practice.`;
  }

  if (outcome === 'needs_improvement') {
    return `Your resume currently has a ${score}% match with this job, but it needs stronger evidence before your application can move forward. Focus on improving ${gapText}, and update your resume with specific projects, responsibilities, and measurable outcomes that demonstrate your ability in these areas.`;
  }

  return `Your resume has a ${score}% match with this job and demonstrates sufficient relevant experience to move forward. You can apply now, but you should still improve ${gapText} and add clear evidence of these skills, technologies, or tools to strengthen your application.`;
};

const analyzeResumeLocally = (job, resumeText) => {
  const weightedTerms = new Map();
  const addTerms = (value, weight, limit) => {
    const terms = [...new Set(getSignificantTokens(value))].slice(0, limit);
    terms.forEach((term) => {
      weightedTerms.set(term, Math.max(weightedTerms.get(term) || 0, weight));
    });
  };

  addTerms(job.projectTitle, 5);
  addTerms(job.position, 4);
  addTerms(job.designCategory, 4);
  (job.category || []).forEach((category) => addTerms(category, 4));
  (job.designSubcategory || []).forEach((subcategory) => addTerms(subcategory, 5));
  (job.jobType || []).forEach((jobType) => addTerms(jobType, 2));
  addTerms(job.description, 1, MAX_LOCAL_DESCRIPTION_TERMS);

  const resumeTerms = new Set(getSignificantTokens(resumeText));
  const rankedTerms = [...weightedTerms.entries()]
    .sort(([, firstWeight], [, secondWeight]) => secondWeight - firstWeight);
  const totalWeight = rankedTerms.reduce((sum, [, weight]) => sum + weight, 0);
  const matchedWeight = rankedTerms.reduce(
    (sum, [term, weight]) => sum + (resumeTerms.has(term) ? weight : 0),
    0,
  );
  const score = totalWeight > 0 ? Math.round((matchedWeight / totalWeight) * 100) : 0;
  const missingSkills = rankedTerms
    .filter(([term]) => !resumeTerms.has(term))
    .slice(0, 8)
    .map(([term]) => term);
  const outcome = getOutcome(score);

  return {
    score,
    missingSkills,
    suggestion: buildLocalSuggestion(score, outcome, missingSkills),
  };
};

const verifyResumeAnalysisToken = (token, userId, jobId) => {
  const result = jwt.verify(token, config.jwt.secret);

  if (
    result.type !== 'resume_match' ||
    result.userId !== userId.toString() ||
    result.jobId !== jobId.toString() ||
    result.score <= 60
  ) {
    throw new Error('Resume analysis verification failed');
  }

  return result;
};

/**
 * Generate AI-powered autofill for tags and description
 * @route POST /v1/ai/autofill
 * @access Private
 */
const generateAutofill = catchAsync(async (req, res) => {
  const { title, category, subcategory, workImages, contextHint } = req.body;

  // Build professional prompt for freelancer platform
  let prompt = `You are an expert creative professional writing a compelling portfolio piece description for a freelance marketplace platform.

Project Title: ${title}
Category: ${category || 'Creative Services'}
Subcategory: ${subcategory || 'Professional Work'}`;

  // Add context hint if provided
  if (contextHint && contextHint.trim()) {
    prompt += `\nAdditional Context: ${contextHint}`;
  }

  prompt += `

Your task is to analyze this creative work and generate:

1. TAGS (6-8 highly specific, searchable keywords):
   - Use professional industry terminology
   - Include style descriptors (e.g., "minimalist", "contemporary", "brutalist")
   - Add technical skills showcased (e.g., "adobe photoshop", "3d modeling", "responsive design")
   - Include relevant methodologies (e.g., "user-centered design", "agile workflow")
   - Add market-relevant terms that clients search for
   - All tags must be lowercase, precise, and SEO-optimized

2. DESCRIPTION (150-300 characters):
   - Write in a professional, confident tone that appeals to potential clients
   - Lead with the project's unique value proposition and key achievements
   - Highlight technical expertise, creative approach, and problem-solving aspects
   - Mention deliverables, methodologies, or notable features
   - Use industry-standard terminology for architecture, design, and creative fields
   - Focus on outcomes, innovation, and professional quality
   - Make it compelling enough to attract high-value freelance clients
   - Emphasize uniqueness and competitive advantages

Context: This is for a premium freelancer platform where professionals showcase their best work in architecture, graphic design, UI/UX, branding, illustration, 3D design, and creative services. The description should position the creator as a skilled professional worth hiring.

Return ONLY valid JSON in this exact format:
{
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5", "tag6"],
  "description": "Compelling professional description that sells the work and expertise..."
}`;

  // Log request
  console.log(`AI Autofill Request - User: ${req.user.id}, Title: ${title}`);

  const startTime = Date.now();

  try {
    const completion = await generateGeminiContent(
      'You are an expert creative director and copywriter specializing in portfolio curation for top-tier freelance platforms. You craft compelling, professional descriptions that highlight technical excellence, creative innovation, and market value. You understand architecture, design systems, branding strategy, UX principles, and creative best practices. Your descriptions are concise yet impactful, using industry-standard terminology that resonates with both clients and fellow professionals. You always respond with valid JSON only.',
      prompt,
      {},
      req.user?.id,
      req.originalUrl || "/api/autofill"
    );

    const responseTime = Date.now() - startTime;

    // Parse response
    const result = JSON.parse(completion.text);

    // Validate output - adjusted for longer descriptions
    if (!result.tags || !Array.isArray(result.tags) || result.tags.length < 5) {
      throw new Error('Invalid AI response: insufficient tags');
    }

    if (!result.description || result.description.length < 100) {
      throw new Error('Invalid AI response: description too short (minimum 100 characters)');
    }

    if (result.description.length > 500) {
      // Trim if too long but keep it professional
      result.description = result.description.substring(0, 497) + '...';
    }

    // Ensure tags are lowercase and trimmed
    const cleanTags = result.tags
      .slice(0, 8) // Max 8 tags
      .map(tag => tag.toLowerCase().trim())
      .filter(tag => tag.length > 0);

    // Trim description
    const cleanDescription = result.description.trim();

    // Log success
    console.log(`AI Autofill Success - User: ${req.user.id}, Response Time: ${responseTime}ms`);

    console.log(`Gemini API - Tokens: ${completion.usage?.totalTokenCount || 'unknown'}, Model: ${config.gemini.model}`);

    return res.status(httpStatus.OK).json({
      success: true,
      tags: cleanTags,
      description: cleanDescription
    });

  } catch (error) {
    console.error('AI Autofill Error:', error);

    if (error.response?.status === 429 || error.status === 429) {
      return res.status(httpStatus.TOO_MANY_REQUESTS).json({
        success: false,
        message: 'API rate limit exceeded. Please try again later.',
        error: 'API_RATE_LIMIT'
      });
    }

    if ([400, 401, 403].includes(error.response?.status || error.status)) {
      return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: 'Server configuration error',
        error: 'CONFIGURATION_ERROR'
      });
    }

    if (error.message && error.message.includes('Invalid AI response')) {
      return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: 'Failed to generate valid autofill data',
        error: 'INVALID_AI_RESPONSE'
      });
    }

    return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Failed to generate autofill',
      error: 'INTERNAL_SERVER_ERROR'
    });
  }
});

const generateResumeMatch = catchAsync(async (req, res) => {
  try {
    const job = await Job.findById(req.body.jobId).lean();
    if (!job) {
      return res.status(httpStatus.NOT_FOUND).json({
        success: false,
        message: 'Job not found',
      });
    }

    let resumeText;
    try {
      resumeText = (await extractResumeText(req.file))
        .replace(/\s+/g, ' ')
        .trim();
    } catch (error) {
      return res.status(httpStatus.BAD_REQUEST).json({
        success: false,
        message: error.message.startsWith('Unsupported resume format') || error.message === 'A resume file is required'
          ? error.message
          : 'Unable to read the resume file. Please upload a readable PDF, DOC, DOCX, or TXT file.',
      });
    }

    if (resumeText.length < 80) {
      return res.status(httpStatus.BAD_REQUEST).json({
        success: false,
        message: 'The uploaded resume does not contain enough readable text. Please upload a text-based resume.',
      });
    }

    let previousAnalysis = req.body.previousAnalysis;
    if (typeof previousAnalysis === 'string' && previousAnalysis.trim()) {
      try {
        previousAnalysis = JSON.parse(previousAnalysis);
      } catch (_) {
        return res.status(httpStatus.BAD_REQUEST).json({ message: 'previousAnalysis must be valid JSON' });
      }
    }
    const previousResume = String(req.body.previousResume || '').trim();
    const threshold = 60;
    const hasPreviousSubmission = Boolean(previousResume && previousAnalysis);

    const prompt = `You are a resume-to-job-description matching engine.

Extract the JD's required skills, preferred skills, and required experience years. For every skill in the resume, treat it as substantiated only when supported by a project, task, outcome, duration, or metric; otherwise treat it as listed_only. Compare required skills against substantiated evidence only. Bare keywords count as unverified_claims and score zero.

When both previous inputs are provided, classify the edit as genuine_improvement, keyword_stuffing, no_change, or unrelated_edit. Without both, use not_applicable. genuine_improvement requires new supporting context. keyword_stuffing means previously missing skills were added without supporting context.

Set eligible_to_apply to true only when match_score > ${threshold}, unverified_claims is empty, and gaming_flag is not keyword_stuffing. For keyword_stuffing, set a 7-day cooldown and require a repo, certificate, or portfolio link for each newly claimed skill.

Job title: ${job.projectTitle}
Job category: ${job.designCategory || (job.category || []).join(', ')}
Job description:
${job.description}

Current resume:
${resumeText.slice(0, MAX_RESUME_CHARACTERS)}

Previous resume:
${hasPreviousSubmission ? previousResume.slice(0, MAX_RESUME_CHARACTERS) : 'Not provided'}

Previous analysis:
${hasPreviousSubmission ? JSON.stringify(previousAnalysis) : 'Not provided'}

Return ONLY valid JSON in this exact shape, no preamble:
{
  "match_score": 0,
  "matched_skills": [],
  "unverified_claims": [],
  "missing_skills": [],
  "gaming_flag": "not_applicable",
  "eligible_to_apply": false,
  "improvement_suggestions": [{ "skill": "", "why_it_matters": "", "how_to_gain_it": "", "evidence_needed": "" }],
  "cooldown_required_days": null
}`;

    let result;
    if (config.gemini.apiKey) {
      try {
        const completion = await generateGeminiContent(
          'You are an expert hiring analyst. You assess resume-to-job fit objectively and always return valid JSON only.',
          prompt,
          { temperature: 0.2, maxOutputTokens: 700 },
          req.user?.id,
          req.originalUrl || "/api/resume-match"
        );

        const aiResult = JSON.parse(completion.text);
        if (!Number.isFinite(Number(aiResult.match_score)) || !Array.isArray(aiResult.matched_skills)) {
          throw new Error('Invalid AI response');
        }
        result = aiResult;
      } catch (error) {
        console.warn(`Resume Match AI unavailable, using local analysis: ${error.message}`);
      }
    }

    if (!result) {
      const local = analyzeResumeLocally(job, resumeText);
      result = {
        match_score: local.score, matched_skills: [], unverified_claims: [],
        missing_skills: local.missingSkills, gaming_flag: 'not_applicable',
        // Do not turn ordinary JD words into a misleading skills checklist when AI is unavailable.
        improvement_suggestions: [],
      };
    }
    const cleanSkills = (items) => (Array.isArray(items) ? items.map(String).map((item) => item.trim()).filter(Boolean) : []);
    const score = Math.max(0, Math.min(100, Math.round(Number(result.match_score) || 0)));
    const matchedSkills = cleanSkills(result.matched_skills);
    const unverifiedClaims = cleanSkills(result.unverified_claims);
    const missingSkills = cleanSkills(result.missing_skills);
    const flags = ['genuine_improvement', 'keyword_stuffing', 'no_change', 'unrelated_edit', 'not_applicable'];
    const gamingFlag = flags.includes(result.gaming_flag) ? result.gaming_flag : 'not_applicable';
    const eligibleToApply = score > threshold && unverifiedClaims.length === 0 && gamingFlag !== 'keyword_stuffing';
    let suggestions = Array.isArray(result.improvement_suggestions) ? result.improvement_suggestions : [];
    let suggestion = suggestions.map((item) => item.how_to_gain_it).filter(Boolean).join(' ')
      || buildLocalSuggestion(score, getOutcome(score), []);
    let screening = null;
    try {
      screening = await screeningService.parseResume(resumeText, job.description, req.user.id);
    } catch (error) {
      // Screening is additive: an AI/parser/link-check failure must never block the legacy flow.
      console.warn(`Applicant screening metadata unavailable; continuing legacy resume flow: ${error.message}`);
    }
    if (screening?.missingSkills?.length) {
      suggestions = screening.missingSkills.map((item) => ({
        skill: item.skill,
        why_it_matters: item.whyItMatters,
        how_to_gain_it: item.howToGainIt,
        evidence_needed: false,
      }));
    }
    if (screening?.suggestedDescription) suggestion = screening.suggestedDescription;
    let resumeFile = null;
    try {
      const uploaded = await uploadFileToS3({ ...req.file, fieldname: 'resume' }, req.user.id);
      resumeFile = { url: uploaded.url, key: uploaded.key, originalName: req.file.originalname, mimetype: req.file.mimetype, size: req.file.size };
    } catch (error) {
      console.warn(`Resume persistence unavailable; continuing without attachment: ${error.message}`);
    }

    const analysisToken = eligibleToApply
      ? jwt.sign(
        {
          type: 'resume_match',
          userId: req.user.id.toString(),
          jobId: job._id.toString(),
          score,
          suggestion,
          missingSkills,
          screening,
          resumeFile,
        },
        config.jwt.secret,
        { expiresIn: '30m' },
      )
      : null;

    return res.status(httpStatus.OK).json({
      score,
      outcome: getOutcome(score),
      suggestion: suggestion || buildLocalSuggestion(score, getOutcome(score), missingSkills),
      match_score: score,
      matched_skills: matchedSkills,
      unverified_claims: unverifiedClaims,
      missing_skills: missingSkills,
      gaming_flag: gamingFlag,
      eligible_to_apply: eligibleToApply,
      improvement_suggestions: suggestions,
      cooldown_required_days: gamingFlag === 'keyword_stuffing' ? 7 : null,
      parsed_skills: screening?.skills || null,
      parsed_about: screening?.aboutSummary || null,
      parsed_projects: screening?.projects || null,
      flagged_projects: screening?.flaggedProjects || null,
      evidence_projects: screening?.evidenceProjects || [],
      analysisToken,
    });
  } catch (error) {
    console.error('Resume Match Error:', error);

    if (
      error.message === 'A resume file is required' ||
      error.message.startsWith('Unsupported resume format')
    ) {
      return res.status(httpStatus.BAD_REQUEST).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Unable to analyze the resume. Please try again with a readable resume file.',
    });
  }
});

const generateApplicationMessage = catchAsync(async (req, res) => {
  const { jobId, score, missingSkills = [], parsedSkills = [], parsedAbout = '', recipientName = 'Recruiter' } = req.body;
  const job = await Job.findById(jobId).lean();
  if (!job) {
    return res.status(httpStatus.NOT_FOUND).json({ success: false, message: 'Job not found' });
  }

  try {
    const completion = await generateGeminiContent(
      'You write concise, honest, polished job application messages tailored to the supplied role. Avoid generic filler, clichés, and repeated stock phrases. Return valid JSON only.',
      `Write a unique, personalized application message from an applicant to ${recipientName || 'the recruiter'} for this job.
Job title: ${job.projectTitle}
Job description: ${String(job.description || '').slice(0, 4000)}
Resume match score: ${score}%
Applicant resume skills: ${parsedSkills.join(', ') || 'Not available'}
Applicant resume summary: ${parsedAbout || 'Not available'}
Skills the applicant should improve: ${missingSkills.join(', ') || 'None identified'}

Use the role details to make the message specific. Do not invent employers, years of experience, qualifications, or projects. Mention relevant fit confidently but honestly. Vary the opening and sentence structure naturally. Write 80 to 140 words. Return only JSON: {"message":"..."}`,
      { temperature: 0.65 },
      req.user?.id,
      req.originalUrl || "/api/application-message"
    );
    const generated = JSON.parse(completion.text).message;
    if (typeof generated !== 'string' || generated.trim().length < 50) {
      throw new Error('Invalid AI response: application message is too short');
    }
    return res.status(httpStatus.OK).json({ success: true, message: generated.trim().slice(0, 1000) });
  } catch (error) {
    console.error(`Application message AI generation failed: ${error.message}`);
    return res.status(503).json({
      success: false,
      message: 'AI could not generate the application message right now. Please try again.',
      error: 'AI_GENERATION_FAILED',
    });
  }
});

const generateProfileAbout = catchAsync(async (req, res) => {
  const { occupations = [], softwareTools = [], currentAbout = '' } = req.body;
  try {
    const completion = await generateGeminiContent(
      'You write authentic, distinctive, polished professional profile biographies. Avoid generic filler, clichés, and reusable stock introductions. Return valid JSON only.',
      `Write a unique first-person About Me biography for a professional profile.
Occupations: ${occupations.join(', ') || 'Not specified'}
Software tools: ${softwareTools.join(', ') || 'Not specified'}
Existing notes: ${currentAbout || 'None'}

Use the supplied details to create natural, specific prose with varied sentence structure. Use only the supplied facts; do not invent employers, qualifications, awards, clients, or years of experience. Keep it warm and professional in 90 to 150 words. Return only JSON: {"aboutMe":"..."}`,
      { temperature: 0.7 },
      req.user?.id,
      req.originalUrl || "/api/profile-about"
    );
    const generated = JSON.parse(completion.text).aboutMe;
    if (typeof generated !== 'string' || generated.trim().length < 80) {
      throw new Error('Invalid AI response: profile biography is too short');
    }
    return res.status(httpStatus.OK).json({ success: true, aboutMe: generated.trim().slice(0, 3000) });
  } catch (error) {
    console.error(`Profile About AI generation failed: ${error.message}`);
    return res.status(503).json({
      success: false,
      message: 'AI could not generate the profile description right now. Please try again.',
      error: 'AI_GENERATION_FAILED',
    });
  }
});

const generateJobDescription = catchAsync(async (req, res) => {
  const { prompt, jobTitle = '', category = '' } = req.body;
  try {
    const completion = await generateGeminiContent(
      'You are a senior talent copywriter. You create distinctive, inclusive, professional job descriptions grounded strictly in the supplied role details. Avoid generic boilerplate, clichés, and repeated stock wording. Return valid JSON only.',
      `Create a unique, complete job description from the recruiter's prompt.
Job title: ${jobTitle || 'Not specified'}
Category: ${category || 'Not specified'}
Recruiter prompt: ${prompt}

Adapt the structure and wording to this specific role. Include a concise overview, concrete responsibilities, required skills and tools, preferred experience, and expected outcomes only when supported by the prompt. Do not invent salary, company details, benefits, qualifications, or requirements. Avoid phrases such as "we are seeking a skilled professional" and "the successful candidate will" unless the context genuinely calls for them. Write 250 to 450 words. Return only JSON: {"description":"..."}`,
      { temperature: 0.7 },
      req.user?.id,
      req.originalUrl || "/api/job-description"
    );
    const generated = JSON.parse(completion.text).description;
    if (typeof generated !== 'string' || generated.trim().length < 200) {
      throw new Error('Invalid AI response: job description is too short');
    }
    return res.status(httpStatus.OK).json({ success: true, description: generated.trim().slice(0, 5000) });
  } catch (error) {
    console.error(`Job description AI generation failed: ${error.message}`);
    return res.status(503).json({
      success: false,
      message: 'AI could not generate the job description right now. Please try again.',
      error: 'AI_GENERATION_FAILED',
    });
  }
});

module.exports = {
  generateAutofill,
  generateResumeMatch,
  generateApplicationMessage,
  generateProfileAbout,
  generateJobDescription,
  verifyResumeAnalysisToken,
};
