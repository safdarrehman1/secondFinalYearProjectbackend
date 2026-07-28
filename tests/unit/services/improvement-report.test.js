const { buildImprovementReport } = require("../../../src/modules/job-filtration/improvement-report.service");

describe("automatic improvement report", () => {
  const job = { type: "gig", gigDetails: { skillsRequired: ["React", "TypeScript", "Node.js"] } };
  test.each([29.99, 60, 60.01])("does not generate outside the 30-59 band (%s)", (score) => {
    expect(buildImprovementReport({ score, parsed: {}, job })).toBeNull();
  });
  test("generates at the lower boundary and keeps three valid gaps", () => {
    const report = buildImprovementReport({ score: 30, parsed: { skills: [] }, job });
    expect(report.items).toHaveLength(3);
    expect(report.score).toBe(30);
  });
  test("generates at 59.99 but not at 60", () => {
    expect(buildImprovementReport({ score: 59.99, parsed: { skills: [] }, job }).items).toHaveLength(3);
    expect(buildImprovementReport({ score: 60, parsed: { skills: [] }, job })).toBeNull();
  });
  test("stores a band report even when no valid gap can be inferred", () => {
    const report = buildImprovementReport({ score: 45, parsed: { skills: [] }, job: { type: "full_time" } });
    expect(report).toBeTruthy();
    expect(report.items).toHaveLength(0);
    expect(report.summary).toContain("No specific skill gap");
  });
});
