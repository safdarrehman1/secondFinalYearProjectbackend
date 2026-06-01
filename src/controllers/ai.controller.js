const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const Groq = require('groq-sdk');
const config = require('../config/config');
const jwt = require('jsonwebtoken');
const path = require('path');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const WordExtractor = require('word-extractor');
const { Job } = require('../models');

// Groq is optional so resume matching still works when the external AI service is unavailable.
const groq = config.groq.apiKey
  ? new Groq({ apiKey: config.groq.apiKey })
  : null;

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
  if (score <= 30) return 'rejected';
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

  return `Your resume has a ${score}% match with this job and demonstrates sufficient relevant experience to move forward. Continue highlighting your strongest role-specific projects and measurable outcomes, especially where they show direct experience with the tools and responsibilities requested in the job description.`;
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
    // Call Groq API
    const completion = await groq.chat.completions.create({
      model: config.groq.model,
      messages: [
        {
          role: "system",
          content: "You are an expert creative director and copywriter specializing in portfolio curation for top-tier freelance platforms. You craft compelling, professional descriptions that highlight technical excellence, creative innovation, and market value. You understand architecture, design systems, branding strategy, UX principles, and creative best practices. Your descriptions are concise yet impactful, using industry-standard terminology that resonates with both clients and fellow professionals. You always respond with valid JSON only."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: config.groq.temperature,
      max_tokens: config.groq.maxTokens,
      response_format: { type: "json_object" }
    });

    const responseTime = Date.now() - startTime;

    // Parse response
    const result = JSON.parse(completion.choices[0].message.content);

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

    // Optional: Log tokens for monitoring (Groq is free)
    console.log(`Groq API - Tokens: ${completion.usage.total_tokens}, Model: ${config.groq.model}`);

    return res.status(httpStatus.OK).json({
      success: true,
      tags: cleanTags,
      description: cleanDescription
    });

  } catch (error) {
    console.error('AI Autofill Error:', error);

    // Handle Groq API errors
    if (error.code === 'rate_limit_exceeded' || error.status === 429) {
      return res.status(httpStatus.TOO_MANY_REQUESTS).json({
        success: false,
        message: 'API rate limit exceeded. Please try again later.',
        error: 'API_RATE_LIMIT'
      });
    }

    if (error.code === 'invalid_api_key' || error.status === 401) {
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

    const prompt = `You are an expert technical recruiter. Compare the applicant resume with the job description and provide a fair, evidence-based skills gap analysis.

Job title: ${job.projectTitle}
Job category: ${job.designCategory || (job.category || []).join(', ')}
Job description:
${job.description}

Applicant resume:
${resumeText.slice(0, MAX_RESUME_CHARACTERS)}

Return ONLY valid JSON in this exact format:
{
  "score": 0,
  "missingSkills": ["skill"],
  "suggestion": "One professional paragraph written directly to the applicant."
}

Scoring rules:
- score must be an integer from 0 to 100 based only on demonstrated job-relevant evidence
- list the most important missing or insufficiently demonstrated skills
- suggestion must be a concise professional paragraph explaining the gap and how the applicant can improve
- do not invent resume experience or qualifications`;

    let result;
    if (groq) {
      try {
        const completion = await groq.chat.completions.create({
          model: config.groq.model,
          messages: [
            {
              role: 'system',
              content: 'You are an expert hiring analyst. You assess resume-to-job fit objectively and always return valid JSON only.',
            },
            { role: 'user', content: prompt },
          ],
          temperature: 0.2,
          max_tokens: 700,
          response_format: { type: 'json_object' },
        });

        const aiResult = JSON.parse(completion.choices[0].message.content);
        if (!Number.isFinite(Number(aiResult.score)) || String(aiResult.suggestion || '').trim().length < 40) {
          throw new Error('Invalid AI response');
        }
        result = aiResult;
      } catch (error) {
        console.warn(`Resume Match AI unavailable, using local analysis: ${error.message}`);
      }
    }

    result = result || analyzeResumeLocally(job, resumeText);
    const score = Math.max(0, Math.min(100, Math.round(Number(result.score) || 0)));
    const missingSkills = Array.isArray(result.missingSkills)
      ? result.missingSkills.slice(0, 8).map((skill) => String(skill).trim()).filter(Boolean)
      : [];
    const suggestion = String(result.suggestion || '').trim();

    if (suggestion.length < 40) {
      throw new Error('Invalid AI response: suggestion is too short');
    }

    const outcome = getOutcome(score);
    const analysisToken = outcome === 'eligible'
      ? jwt.sign(
        {
          type: 'resume_match',
          userId: req.user.id.toString(),
          jobId: job._id.toString(),
          score,
          suggestion,
          missingSkills,
        },
        config.jwt.secret,
        { expiresIn: '30m' },
      )
      : null;

    return res.status(httpStatus.OK).json({
      success: true,
      score,
      outcome,
      missingSkills,
      suggestion,
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

module.exports = {
  generateAutofill,
  generateResumeMatch,
  verifyResumeAnalysisToken,
};
