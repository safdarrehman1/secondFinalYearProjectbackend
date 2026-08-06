const normalize = (value) => String(value || "")
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

const STRUCTURE_ERROR = "This doesn't look like a resume — a Summary/About section and a Skills section are required. Please upload your resume.";

const SECTION_GROUPS = {
  summary: ["professional summary", "career summary", "summary", "about me", "about", "professional profile", "profile", "career objective", "objective"],
  skills: ["technical skills", "tech skills", "core competencies", "key skills", "professional skills", "skills"],
  experience: ["professional experience", "work experience", "employment experience", "employment history", "experience"],
  education: ["education", "academic background", "qualifications"],
  projects: ["projects", "project experience"],
  certifications: ["certifications", "certificates"],
};

const ALL_HEADINGS = Object.values(SECTION_GROUPS).flat().sort((left, right) => right.length - left.length);
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const headingAlternation = ALL_HEADINGS.map(escapeRegex).join("|");
const inlineHeadingAlternation = ALL_HEADINGS.flatMap((heading) => [
  heading.toUpperCase(),
  heading.replace(/\b\w/g, (character) => character.toUpperCase()),
]).map(escapeRegex).join("|");
const exactHeading = new RegExp(`^(?:${headingAlternation})\\s*[:—–-]?\\s*$`, "i");

const wordCount = (value) => (String(value || "").match(/[A-Za-z0-9+#.]+/g) || []).length;

const sectionBody = (text, headings) => {
  const lines = String(text || "").replace(/\r/g, "").split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const heading = lines[index].trim().replace(/\s*[:—–-]\s*$/, "").toLowerCase();
    if (!headings.includes(heading)) continue;
    const body = [];
    for (let bodyIndex = index + 1; bodyIndex < lines.length; bodyIndex += 1) {
      if (exactHeading.test(lines[bodyIndex].trim())) break;
      body.push(lines[bodyIndex]);
    }
    if (body.join(" ").trim()) return body.join(" ").trim();
  }

  // The legacy endpoint normalizes line breaks before validation. Preserve support
  // for clear Title Case/ALL CAPS inline section breaks without matching ordinary
  // lower-case words used incidentally in prose.
  const inlineHeadings = headings.flatMap((heading) => [
    heading.toUpperCase(),
    heading.replace(/\b\w/g, (character) => character.toUpperCase()),
  ]).map(escapeRegex).join("|");
  const inlinePattern = new RegExp(`(?:^|\\s)(?:${inlineHeadings})\\s*[:—–-]?\\s+([\\s\\S]*?)(?=\\s(?:${inlineHeadingAlternation})\\s*[:—–-]?\\s|$)`);
  return inlinePattern.exec(String(text || ""))?.[1]?.trim() || "";
};

const hasSectionContent = (text, headings, minimumWords) => wordCount(sectionBody(text, headings)) >= minimumWords;

const validateResumeDocument = ({ text, accountName }) => {
  const readableText = String(text || "").replace(/\s+/g, " ").trim();
  if (readableText.length < 50) {
    throw new Error("This file does not contain enough readable resume content.");
  }

  const looksLikeLetter = /\b(cover letter|project proposal|business proposal|invoice|receipt)\b/i.test(readableText);
  if (looksLikeLetter && readableText.length < 300) {
    throw new Error("The uploaded file appears to be a cover letter or proposal. Upload a CV/resume instead.");
  }

  if (accountName) {
    const normalizedName = normalize(accountName);
    const nameParts = normalizedName.split(" ").filter((part) => part.length > 1);
    if (nameParts.length > 0) {
      const header = ` ${normalize(readableText.slice(0, 3000))} `;
      const fullNameMatches = header.includes(` ${normalizedName} `);
      const namePartMatches = nameParts.some((part) => header.includes(` ${part} `));
      if (!fullNameMatches && !namePartMatches) {
        throw new Error(`The resume candidate name does not match the signed-in account (${accountName}). Upload your own resume.`);
      }
    }
  }

  return true;
};

const namesMatch = (left, right) => {
  const leftParts = normalize(left).split(" ").filter((part) => part.length > 1);
  const rightText = ` ${normalize(right)} `;
  return leftParts.length > 0 && leftParts.every((part) => rightText.includes(` ${part} `));
};

module.exports = { namesMatch, validateResumeDocument };
