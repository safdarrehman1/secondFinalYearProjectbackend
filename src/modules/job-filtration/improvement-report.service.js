const normalize = (value) => String(value || "").trim();

const buildImprovementReport = ({ score, parsed = {}, job }) => {
  if (Number(score) < 30 || Number(score) >= 60) return null;

  const parsedSkills = new Set((parsed.skills || []).map((skill) => normalize(skill).toLowerCase()).filter(Boolean));
  const aiGaps = (parsed.missingSkills || []).map((gap) => ({
    skill: normalize(gap.skill),
    whyItMatters: normalize(gap.whyItMatters),
    action: normalize(gap.howToGainIt),
    evidenceNeeded: `Add a concrete project, responsibility, or measurable result demonstrating ${normalize(gap.skill)}.`,
  })).filter((gap) => gap.skill && gap.whyItMatters && gap.action);

  const requiredSkills = job.type === "gig"
    ? job.gigDetails?.skillsRequired || []
    : parsed.requiredSkillsFromJD || [];
  const deterministicGaps = requiredSkills
    .filter((skill) => !parsedSkills.has(normalize(skill).toLowerCase()))
    .map((skill) => ({
      skill: normalize(skill),
      whyItMatters: `${normalize(skill)} is listed as a requirement for this role.`,
      action: `Complete focused training and a practical exercise using ${normalize(skill)}.`,
      evidenceNeeded: `Add a verifiable project or work example showing how you used ${normalize(skill)}.`,
    }));

  const unique = new Map();
  [...aiGaps, ...deterministicGaps].forEach((item) => {
    const key = item.skill.toLowerCase();
    if (key && !unique.has(key)) unique.set(key, item);
  });
  const items = [...unique.values()].slice(0, 8);
  return {
    generatedAt: new Date(),
    score: Number(score),
    provider: aiGaps.length ? "gemini_with_deterministic_validation" : "deterministic",
    summary: items.length
      ? `Your ${Math.round(Number(score))}% match is below the required 60%. Address the gaps below before reapplying.`
      : `Your ${Math.round(Number(score))}% match is below the required 60%. No specific skill gap could be validated automatically, so strengthen the evidence and measurable outcomes in your resume before reapplying.`,
    items,
  };
};

module.exports = { buildImprovementReport };
