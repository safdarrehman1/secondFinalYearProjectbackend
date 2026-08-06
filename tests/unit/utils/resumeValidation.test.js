const { validateResumeDocument } = require("../../../src/utils/resumeValidation");

const validResume = `Safdar Ali\nsafdar@example.com\n+92 300 1234567\nProfessional Summary\nMobile developer building production applications.\nSkills\nReact Native, TypeScript, Node.js\nWork Experience\nMobile Engineer at Example Company from 2022 to present.\nEducation\nBS Computer Science`;
const structureError = "This doesn't look like a resume — a Summary/About section and a Skills section are required. Please upload your resume.";

describe("resumeValidation", () => {
  test("accepts a resume belonging to the signed-in user", () => {
    expect(validateResumeDocument({ text: validResume, accountName: "Safdar Ali" })).toBe(true);
  });

  test("rejects an unrelated document without required resume sections", () => {
    expect(() => validateResumeDocument({
      text: "Project Proposal\nDear Hiring Manager,\nWe propose delivery of your project with milestones and pricing. Contact team@example.com for the complete commercial agreement and payment schedule.",
      accountName: "Safdar Ali",
    })).toThrow(structureError);
  });

  test("rejects a resume missing the Summary/About section", () => {
    expect(() => validateResumeDocument({
      text: validResume.replace("Professional Summary\nMobile developer building production applications.\n", ""),
      accountName: "Safdar Ali",
    })).toThrow(structureError);
  });

  test("rejects a resume missing the Skills section", () => {
    expect(() => validateResumeDocument({
      text: validResume.replace("Skills\nReact Native, TypeScript, Node.js\n", ""),
      accountName: "Safdar Ali",
    })).toThrow(structureError);
  });

  test("rejects headings that do not have enough body content", () => {
    expect(() => validateResumeDocument({
      text: validResume.replace("Mobile developer building production applications.", "Developer").replace("React Native, TypeScript, Node.js", "JavaScript"),
      accountName: "Safdar Ali",
    })).toThrow(structureError);
  });

  test("rejects another person's resume", () => {
    expect(() => validateResumeDocument({ text: validResume.replace("Safdar Ali", "Another Person"), accountName: "Safdar Ali" }))
      .toThrow("does not match");
  });
});
