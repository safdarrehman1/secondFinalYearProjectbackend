const axios = require('axios');
const dns = require('dns').promises;
const config = require('../../config/config');
const Questionnaire = require('./questionnaire.model');
const QuestionnaireResponse = require('./questionnaire-response.model');
const AppliedJobs = require('../../models/appliedJobs.model');
const aiService = require('../../services/aiService');

const aiJson = async (systemInstruction, prompt, maxOutputTokens = 1800, temperature = 0.2, model = null, userId = null, endpoint = "unknown") => {
  return aiService.generateJson(
    systemInstruction,
    prompt,
    { maxOutputTokens, temperature, model: model || config.gemini.model },
    userId,
    endpoint
  );
};

const normalizeProjects = (projects) => (Array.isArray(projects) ? projects : []).slice(0, 20).map((project) => ({
  name: String(project?.name || 'Unnamed project').slice(0, 200),
  description: String(project?.description || '').slice(0, 1500),
  link: project?.link ? String(project.link).slice(0, 2000) : null,
}));

const verifyProjectLinks = async (projects) => Promise.all(normalizeProjects(projects).map(async (project) => {
  if (!project.link) return { name: project.name, reason: 'no_link' };
  try {
    const url = new URL(project.link);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Unsupported protocol');
    const addresses = await dns.lookup(url.hostname, { all: true });
    const unsafe = addresses.some(({ address }) => address === '::1' || address.startsWith('127.') || address.startsWith('10.') || address.startsWith('192.168.') || /^172\.(1[6-9]|2\d|3[01])\./.test(address) || address.startsWith('169.254.') || address.startsWith('fc') || address.startsWith('fd') || address.startsWith('fe80:'));
    if (unsafe) throw new Error('Private network links are not allowed');
    try {
      await axios.head(url.toString(), { timeout: 5000, maxRedirects: 5, validateStatus: (status) => status >= 200 && status < 400 });
    } catch (_) {
      await axios.get(url.toString(), { timeout: 5000, maxRedirects: 5, maxContentLength: 1024 * 1024, validateStatus: (status) => status >= 200 && status < 400 });
    }
    return null;
  } catch (_) {
    return { name: project.name, reason: 'broken_link' };
  }
})).then((items) => items.filter(Boolean));

const parseResume = async (resumeText, jobDescription, userId = null) => {
  const parsed = await aiJson(
    'Extract resume facts faithfully. Never invent facts. Return JSON only.',
    `Resume:\n${resumeText.slice(0, 18000)}\n\nReturn {"skills":["..."],"about_summary":"...","projects":[{"name":"...","description":"...","link":null}]}`,
    1800,
    0.2,
    null,
    userId,
    "/v1/applications/parse-resume-facts"
  );
  const skills = (Array.isArray(parsed.skills) ? parsed.skills : []).map(String).map((v) => v.trim()).filter(Boolean).slice(0, 50);
  const aboutSummary = String(parsed.about_summary || '').slice(0, 3000);
  const projects = normalizeProjects(parsed.projects);
  const match = await aiJson(
    'You are a precise hiring analyst. Identify only concrete technical, professional, tool, framework, or domain skills explicitly required by the job. Never return ordinary words from prose as skills. Return JSON only.',
    `Job description:\n${String(jobDescription || '').slice(0, 8000)}\n\nApplicant skills: ${skills.join(', ')}\nApplicant summary: ${aboutSummary}\nApplicant projects: ${JSON.stringify(projects).slice(0, 7000)}\n\nReturn this exact structure:\n{"match_score":0,"suggested_description":"2-4 sentences explaining the result and next action","missing_skills":[{"skill":"specific missing job skill","why_it_matters":"job-specific reason","how_to_gain_it":"concrete improvement action"}],"relevant_projects_without_links":[{"project_name":"exact project name from resume","skills":["job-relevant skill demonstrated by this project"]}]}\nRules: match_score is 0-100. missing_skills must contain only requirements that are in the JD and absent or unsupported in the resume. relevant_projects_without_links must include only projects that are relevant to this JD, demonstrate a matched skill, and have no link in the resume. Do not include projects that already have a link.`,
    1200,
    0.2,
    null,
    userId,
    "/v1/applications/parse-resume-fit"
  );
  const matchScore = Math.max(0, Math.min(100, Math.round(Number(match.match_score) || 0)));
  const flaggedProjects = await verifyProjectLinks(projects);
  const projectNamesWithoutLinks = new Set(projects.filter((project) => !project.link).map((project) => project.name.toLowerCase()));
  const missingSkills = (Array.isArray(match.missing_skills) ? match.missing_skills : []).slice(0, 8).map((item) => ({
    skill: String(item?.skill || '').trim().slice(0, 100),
    whyItMatters: String(item?.why_it_matters || '').trim().slice(0, 500),
    howToGainIt: String(item?.how_to_gain_it || '').trim().slice(0, 500),
  })).filter((item) => item.skill && item.whyItMatters && item.howToGainIt);
  const evidenceProjects = (Array.isArray(match.relevant_projects_without_links) ? match.relevant_projects_without_links : []).slice(0, 10).map((item) => ({
    projectName: String(item?.project_name || '').trim().slice(0, 200),
    skills: (Array.isArray(item?.skills) ? item.skills : []).map(String).map((value) => value.trim()).filter(Boolean).slice(0, 10),
  })).filter((item) => item.projectName && item.skills.length > 0 && projectNamesWithoutLinks.has(item.projectName.toLowerCase()));
  const suggestedDescription = String(match.suggested_description || '').trim().slice(0, 2000);
  return { skills, aboutSummary, projects, flaggedProjects, matchScore, missingSkills, evidenceProjects, suggestedDescription };
};

const seededShuffle = (items, seedText) => {
  const shuffled = [...items];
  let seed = String(seedText).split('').reduce((sum, character) => sum + character.charCodeAt(0), 0) || 1;
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    seed = (seed * 9301 + 49297) % 233280;
    const target = Math.floor((seed / 233280) * (index + 1));
    [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
  }
  return shuffled;
};

const generateQuestionnaire = async (application, job, userId = null) => {
  let questions = [];

  if (job && job.questionSource === 'manual') {
    const rawCustom = (Array.isArray(job.customQuestions) && job.customQuestions.length > 0)
      ? job.customQuestions
      : (Array.isArray(job.test?.questions) ? job.test.questions : []);

    if (rawCustom.length > 0) {
      questions = rawCustom.map((q, index) => ({
        id: `q${index + 1}`,
        type: q.type === 'text' ? 'text' : 'mcq',
        prompt: String(q.questionText || q.prompt || '').trim(),
        options: Array.isArray(q.options) ? q.options.map(String).map((o) => o.trim()).filter(Boolean) : [],
        correctAnswer: String(q.correctAnswer || q.correct_answer || '').trim(),
      }));

      questions = seededShuffle(questions, `${application._id}:questions`).map((question, index) => ({
        ...question,
        id: `q${index + 1}`,
        options: question.options.length ? seededShuffle(question.options, `${application._id}:options:${index}`) : [],
      }));

      return Questionnaire.findOneAndUpdate(
        { applicationId: application._id },
        { applicationId: application._id, questions },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      );
    }
  }

  const otherApplicationIds = await AppliedJobs.find({ jobId: application.jobId, _id: { $ne: application._id } }).distinct('_id');
  const previousQuestionnaires = otherApplicationIds.length
    ? await Questionnaire.find({ applicationId: { $in: otherApplicationIds } }).select('questions.prompt').lean()
    : [];
  const previousPrompts = new Set(previousQuestionnaires.flatMap((questionnaire) =>
    (questionnaire.questions || []).map((question) => String(question.prompt || '').trim().toLowerCase()).filter(Boolean)));
  const exclusions = [...previousPrompts].slice(0, 40);

  for (let attempt = 0; attempt < 2 && questions.length < 5; attempt += 1) {
    try {
      const result = await aiJson(
        'Create fair, job-relevant, applicant-specific screening questions. Return JSON only.',
        `Application variant: ${application._id}-${attempt + 1}\nCandidate variant: ${application.createdBy || application.candidate || userId || ''}\nJob title: ${job?.projectTitle || job?.position || ''}\nJob description: ${String(job?.description || '').slice(0, 8000)}\nApplicant resume summary: ${String(application.parsedAbout || '').slice(0, 3000)}\nApplicant skills: ${(application.parsedSkills || []).join(', ')}\nApplicant projects: ${JSON.stringify(application.parsedProjects || []).slice(0, 5000)}\nQuestions already used for this job and forbidden for this applicant: ${JSON.stringify(exclusions)}\nCreate 5 to 8 original MCQs tailored to this applicant's specific resume evidence and this job description. Return {"questions":[{"id":"q1","type":"mcq","prompt":"...","options":["..."],"correct_answer":"exact option text"}]}. Each must have exactly 4 distinct options and one unambiguous answer.`,
        2600,
        0.65,
        config.gemini.model,
        userId,
        "/v1/applications/generate-screening-test-mcq"
      );

      const parsed = (Array.isArray(result.questions) ? result.questions : []).map((q, index) => {
        const promptText = String(q.prompt || '').trim();
        const opts = [...new Set((Array.isArray(q.options) ? q.options : []).map(String).map((o) => o.trim()).filter(Boolean))].slice(0, 4);
        let correct = String(q.correct_answer || q.correctAnswer || '').trim();
        if (opts.length > 0 && !opts.includes(correct)) {
          const match = opts.find((o) => o.toLowerCase() === correct.toLowerCase()) || opts[0];
          correct = match;
        }
        return {
          id: `q${index + 1}`,
          type: 'mcq',
          prompt: promptText,
          options: opts,
          correctAnswer: correct,
        };
      }).filter((q) => q.prompt && q.options.length >= 2);

      const filtered = attempt === 0
        ? parsed.filter((q) => !previousPrompts.has(q.prompt.toLowerCase()))
        : parsed;

      if (filtered.length > questions.length) {
        questions = filtered;
      }
    } catch (err) {
      console.warn(`AI questionnaire generation attempt ${attempt + 1} failed: ${err.message}`);
    }
  }

  // Fallback if AI generation returns fewer than 4 questions
  if (questions.length < 4) {
    const title = job?.projectTitle || job?.position || 'Role';
    const reqSkill = (job?.requiredSkills || job?.cultureArea || ['Technical Knowledge'])[0] || 'Technical Knowledge';
    questions = [
      {
        id: 'q1', type: 'mcq',
        prompt: `What is the most effective engineering approach when working as a ${title}?`,
        options: [
          'Following established design patterns, writing tests, and documenting implementation',
          'Deploying code directly to production without testing',
          'Bypassing security protocols to meet immediate deadlines',
          'Refusing to collaborate or review peer contributions'
        ],
        correctAnswer: 'Following established design patterns, writing tests, and documenting implementation'
      },
      {
        id: 'q2', type: 'mcq',
        prompt: `When applying ${reqSkill} in project development, which principle ensures long-term system stability?`,
        options: [
          'Modular code organization with automated verification and clear boundaries',
          'Hardcoding configuration values directly into business logic',
          'Ignoring error handling and logging mechanisms',
          'Deleting version control history frequently'
        ],
        correctAnswer: 'Modular code organization with automated verification and clear boundaries'
      },
      {
        id: 'q3', type: 'mcq',
        prompt: `How should unexpected edge cases or architectural bottlenecks be addressed during execution?`,
        options: [
          'Analyze root cause, prototype solution, measure performance, and communicate changes',
          'Ignore errors until users report system downtime',
          'Suppress warning logs without addressing underlying bugs',
          'Abandon project requirements without consulting stakeholders'
        ],
        correctAnswer: 'Analyze root cause, prototype solution, measure performance, and communicate changes'
      },
      {
        id: 'q4', type: 'mcq',
        prompt: `What practice best ensures software quality before releasing new features?`,
        options: [
          'Comprehensive unit testing, integration tests, and peer code reviews',
          'Relying solely on manual inspection in production',
          'Disabling all linter rules and continuous integration checks',
          'Deploying untested code during peak traffic hours'
        ],
        correctAnswer: 'Comprehensive unit testing, integration tests, and peer code reviews'
      },
      {
        id: 'q5', type: 'mcq',
        prompt: `What is critical when integrating new components into an existing architecture?`,
        options: [
          'Ensuring backward compatibility, API contracts, and updating technical docs',
          'Breaking public API signatures without deprecation notices',
          'Removing automated test suites to speed up build times',
          'Committing credentials directly to source control'
        ],
        correctAnswer: 'Ensuring backward compatibility, API contracts, and updating technical docs'
      }
    ];
  }

  questions = questions.slice(0, 8).map((q, index) => ({
    ...q,
    id: `q${index + 1}`,
  }));

  return Questionnaire.findOneAndUpdate(
    { applicationId: application._id },
    { applicationId: application._id, questions },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
};

const publicQuestionnaire = (questionnaire) => {
  if (!questionnaire) return null;
  const obj = typeof questionnaire.toObject === "function" ? questionnaire.toObject() : questionnaire;
  return {
    ...obj,
    questions: (obj.questions || []).map(({ correctAnswer, ...q }) => q),
  };
};

const submitAnswers = async (questionnaire, answers) => {
  const answerMap = new Map((Array.isArray(answers) ? answers : []).map((a) => [String(a.questionId), String(a.answer || '')]));
  const correct = questionnaire.questions.reduce((total, question) => total + (answerMap.get(String(question.id)) === question.correctAnswer ? 1 : 0), 0);
  const score = Math.round((correct / questionnaire.questions.length) * 100);
  await QuestionnaireResponse.findOneAndUpdate(
    { questionnaireId: questionnaire._id },
    { questionnaireId: questionnaire._id, answers, score, submittedAt: new Date() },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  return score;
};

module.exports = { parseResume, generateQuestionnaire, publicQuestionnaire, submitAnswers };
