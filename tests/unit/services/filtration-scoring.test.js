const scoring = require("../../../src/modules/job-filtration/scoring.service");

describe("job filtration scoring helpers", () => {
  test("scores required skill overlap as a percentage", () => {
    expect(scoring.keywordOverlap(["Node.js", "MongoDB"], ["node.js", "mongodb", "react"])).toBeCloseTo(66.67, 1);
  });
  test("caps experience matching at 100", () => {
    expect(scoring.matchExperience(6, 3)).toBe(100);
    expect(scoring.matchExperience(2, 4)).toBe(50);
  });
  test("computes stability from average tenure", () => {
    expect(scoring.computeStability([{ durationMonths: 24 }, { durationMonths: 24 }])).toBe(100);
  });
});
