const lifecycle = require("../../../src/modules/job-filtration/job-lifecycle.service");

const job = (status, overrides = {}) => ({
  status,
  poster: "poster-id",
  lifecycleHistory: [],
  save: jest.fn().mockResolvedValue(undefined),
  ...overrides,
});

describe("filtration job lifecycle", () => {
  test("published jobs accept applications before expiration", () => {
    expect(lifecycle.isAcceptingApplications(job("published", { expiresAt: new Date(Date.now() + 60000) }))).toBe(true);
  });

  test.each(["draft", "scheduled", "paused", "filled", "closed", "archived"])("%s jobs reject applications", (status) => {
    expect(lifecycle.isAcceptingApplications(job(status))).toBe(false);
  });

  test("expired published jobs have an effective closed status", () => {
    expect(lifecycle.effectiveStatus(job("published", { expiresAt: new Date(Date.now() - 1000) }))).toBe("closed");
  });

  test("scheduled jobs publish when their time arrives", () => {
    expect(lifecycle.effectiveStatus(job("scheduled", { publishAt: new Date(Date.now() - 1000) }))).toBe("published");
  });

  test("records an authorized lifecycle transition", async () => {
    const item = job("published");
    await lifecycle.transition(item, "paused", "poster-id", "Hiring review");
    expect(item.status).toBe("paused");
    expect(item.lifecycleHistory[0]).toMatchObject({ from: "published", to: "paused", changedBy: "poster-id", reason: "Hiring review" });
    expect(item.save).toHaveBeenCalledTimes(1);
  });

  test("rejects an invalid lifecycle transition", async () => {
    await expect(lifecycle.transition(job("archived"), "published", "poster-id")).rejects.toMatchObject({ statusCode: 409 });
  });
});
