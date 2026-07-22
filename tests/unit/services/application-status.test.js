const status = require("../../../src/modules/job-filtration/application-status.service");

const application = (finalStatus = "applied") => ({ finalStatus, statusHistory: [] });

describe("filtration application status", () => {
  test("records status changes with actor and reason", () => {
    const item = application();
    status.changeStatus(item, "under_review", "poster-id", "Strong match");
    expect(item.finalStatus).toBe("under_review");
    expect(item.statusHistory[0]).toMatchObject({ from: "applied", to: "under_review", changedBy: "poster-id", reason: "Strong match" });
  });

  test("records candidate withdrawal", () => {
    const item = application("test_completed");
    status.changeStatus(item, "withdrawn", "candidate-id", "Accepted another role");
    expect(item.withdrawnAt).toBeInstanceOf(Date);
  });

  test.each(["hired", "rejected", "withdrawn"])("prevents transitions from terminal status %s", (current) => {
    expect(() => status.changeStatus(application(current), "shortlisted", "poster-id")).toThrow(/cannot change status/);
  });
});
