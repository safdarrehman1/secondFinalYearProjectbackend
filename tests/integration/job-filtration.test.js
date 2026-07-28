const request = require("supertest");
const httpStatus = require("http-status");
const app = require("../../src/app");
const setupTestDB = require("../utils/setupTestDB");
const { User } = require("../../src/models");
const FiltrationJob = require("../../src/modules/job-filtration/filtration-job.model");
const FiltrationApplication = require("../../src/modules/job-filtration/filtration-application.model");
const AuditLog = require("../../src/models/auditLog.model");
const scoringService = require("../../src/modules/job-filtration/scoring.service");
const { userOne, userTwo, insertUsers } = require("../fixtures/user.fixture");
const { userOneAccessToken, userTwoAccessToken } = require("../fixtures/token.fixture");

// Mock external email & payments services to avoid errors
jest.mock("resend", () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: jest.fn().mockResolvedValue({ id: "email_id" }) },
  })),
}));

jest.mock("square", () => ({
  SquareClient: class {},
  SquareEnvironment: { Sandbox: "sandbox", Production: "production" },
}));

jest.mock("@apimatic/axios-client-adapter", () => ({
  HttpClient: class {
    execute() {
      return Promise.resolve({});
    }
  },
}));

jest.mock("axios", () => ({
  create: () => ({
    get: jest.fn(),
    post: jest.fn(),
  }),
  get: jest.fn(),
  post: jest.fn(),
}));

jest.mock("@paypal/paypal-server-sdk", () => ({
  Client: jest.fn().mockImplementation(() => ({})),
  Environment: { Sandbox: "sandbox" },
  OrdersController: jest.fn().mockImplementation(() => ({
    ordersCreate: jest.fn(),
    ordersCapture: jest.fn(),
  })),
  CheckoutPaymentIntent: { Capture: "CAPTURE" },
  ApiError: class extends Error {},
}));

jest.mock("../../src/services/paypal.service", () => ({
  createPayment: jest.fn(),
  executePayment: jest.fn(),
  refundPayment: jest.fn(),
}));

jest.mock("../../src/services/squareService", () => ({
  createPayment: jest.fn(),
  completePayment: jest.fn(),
}));

jest.mock("../../src/services/stripe.service", () => ({
  createPaymentIntent: jest.fn(),
  confirmPaymentIntent: jest.fn(),
}));

setupTestDB();
jest.setTimeout(30000);

describe("Job Filtration & Lifecycle Integration", () => {
  let poster, candidate, posterToken, candidateToken;

  beforeEach(async () => {
    await insertUsers([userOne, userTwo]);
    poster = userOne;
    candidate = userTwo;
    posterToken = userOneAccessToken;

    const moment = require("moment");
    const tokenService = require("../../src/services/token.service");
    const { tokenTypes } = require("../../src/config/tokens");
    const config = require("../../src/config/config");
    candidateToken = tokenService.generateToken(
      candidate._id,
      moment().add(config.jwt.accessExpirationMinutes, "minutes"),
      tokenTypes.ACCESS
    );
  });

  describe("Job creation and lifecycle", () => {
    test("should successfully save a job as draft", async () => {
      const res = await request(app)
        .post("/api/jobs")
        .set("Authorization", `Bearer ${posterToken}`)
        .send({
          type: "full_time",
          title: "Architectural Designer Needed",
          description: "We are looking for a senior designer to plan new models.",
          scoringConfig: { skillWeight: 0.4, experienceWeight: 0.3, stabilityWeight: 0.3 },
          minResumePct: 60,
          minTestPct: 70,
          cooldownDays: 3,
          fullTimeDetails: {
            salaryMin: 5000,
            salaryMax: 10000,
            location: "New York",
            workMode: "remote",
            employmentType: "permanent",
            experienceRequiredYears: 3,
          },
        })
        .expect(httpStatus.CREATED);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe("draft");

      const jobId = res.body.data.id || res.body.data._id;
      let dbJob = null;
      if (jobId) {
        dbJob = await FiltrationJob.findById(jobId);
      }
      if (!dbJob) {
        dbJob = await FiltrationJob.findOne({ title: "Architectural Designer Needed" });
      }
      expect(dbJob).toBeDefined();
      expect(dbJob).not.toBeNull();
      expect(dbJob.title).toBe("Architectural Designer Needed");
    });

    test("should transition a draft job to published status", async () => {
      const job = await FiltrationJob.create({
        poster: poster._id,
        type: "full_time",
        title: "Interior Designer",
        description: "Must know AutoCAD and SketchUp for drafting layout.",
        scoringConfig: { skillWeight: 0.4, experienceWeight: 0.3, stabilityWeight: 0.3 },
        status: "draft",
        fullTimeDetails: {
          salaryMin: 5000,
          salaryMax: 10000,
          location: "New York",
          workMode: "remote",
          employmentType: "permanent",
          experienceRequiredYears: 3,
        },
      });

      const res = await request(app)
        .post(`/api/jobs/${job._id}/publish`)
        .set("Authorization", `Bearer ${posterToken}`)
        .send()
        .expect(httpStatus.OK);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe("published");

      const dbJob = await FiltrationJob.findById(job._id);
      expect(dbJob.status).toBe("published");
    });

    test.each([
      [59.99, httpStatus.BAD_REQUEST],
      [60, httpStatus.CREATED],
      [60.01, httpStatus.CREATED],
    ])("should enforce the non-bypassable resume threshold at %s", async (threshold, expectedStatus) => {
      const res = await request(app)
        .post("/api/jobs")
        .set("Authorization", `Bearer ${posterToken}`)
        .send({
          type: "full_time",
          title: `Threshold ${threshold}`,
          description: "A sufficiently detailed role description for boundary validation.",
          scoringConfig: { skillWeight: 0.4, experienceWeight: 0.3, stabilityWeight: 0.3 },
          minResumePct: threshold,
          minTestPct: 60,
          fullTimeDetails: { salaryMin: 5000, salaryMax: 10000, location: "Remote", workMode: "remote", employmentType: "permanent", experienceRequiredYears: 2 },
        })
        .expect(expectedStatus);
      if (expectedStatus === httpStatus.CREATED) expect(res.body.data.minResumePct).toBe(threshold);
    });
  });

  describe("Application pipeline and restrictions", () => {
    let activeJob;

    beforeEach(async () => {
      activeJob = await FiltrationJob.create({
        poster: poster._id,
        type: "full_time",
        title: "BIM Specialist",
        description: "BIM Revit professional workflow is required.",
        scoringConfig: { skillWeight: 0.4, experienceWeight: 0.3, stabilityWeight: 0.3 },
        status: "published",
        fullTimeDetails: {
          salaryMin: 5000,
          salaryMax: 10000,
          location: "New York",
          workMode: "remote",
          employmentType: "permanent",
          experienceRequiredYears: 3,
        },
      });
    });

    test("should submit candidate application successfully", async () => {
      const res = await request(app)
        .post(`/api/jobs/${activeJob._id}/apply`)
        .set("Authorization", `Bearer ${candidateToken}`)
        .send({
          resumeText: "BIM Specialist Revit AutoCAD Architecture Graduate with years of experience and drafting layout.",
          resumeUrl: "http://example.com/resume.pdf",
        })
        .expect(httpStatus.CREATED);

      expect(res.body.success).toBe(true);
      expect(["applied", "under_review"]).toContain(res.body.data.finalStatus);

      const appId = res.body.data.id || res.body.data._id;
      const dbApp = await FiltrationApplication.findById(appId);
      expect(dbApp).toBeDefined();
      expect(dbApp.candidate.toString()).toBe(candidate._id.toString());
    });

    test("should prevent duplicate candidate applications", async () => {
      const resumeString = "BIM Specialist Revit AutoCAD Architecture Graduate with years of experience and drafting layout.";
      await FiltrationApplication.create({
        job: activeJob._id,
        candidate: candidate._id,
        resumeText: resumeString,
        finalStatus: "applied",
      });

      const res = await request(app)
        .post(`/api/jobs/${activeJob._id}/apply`)
        .set("Authorization", `Bearer ${candidateToken}`)
        .send({
          resumeText: resumeString,
          resumeUrl: "http://example.com/resume.pdf",
        })
        .expect(httpStatus.CONFLICT);

      expect(res.body.message).toContain("cooldown");
    });

    test("should automatically persist and return an improvement report for a 30-59 percent rejection", async () => {
      const gig = await FiltrationJob.create({
        poster: poster._id, type: "gig", title: "React API Integration", description: "React, TypeScript, Node.js, testing, and API integration are required.",
        scoringConfig: { skillWeight: 0.8, experienceWeight: 0.2, stabilityWeight: 0 }, minResumePct: 60, status: "published",
        gigDetails: { budget: 1000, deadline: new Date(Date.now() + 86400000), deliverables: ["Application"], skillsRequired: ["React", "TypeScript", "Node.js"] },
      });
      const scoreMock = jest.spyOn(scoringService, "scoreResume").mockResolvedValueOnce({
        raw: 45, weighted: 45, breakdown: { skillScore: 45, experienceScore: 0, stabilityScore: 0 }, provider: "gemini", model: "test", scoringVersion: "test", confidence: 0.9, requiresManualReview: false,
        parsed: { skills: [], missingSkills: [
          { skill: "React", whyItMatters: "Required for the interface", howToGainIt: "Build a React project" },
          { skill: "TypeScript", whyItMatters: "Required for type safety", howToGainIt: "Complete a TypeScript course" },
          { skill: "Node.js", whyItMatters: "Required for the API", howToGainIt: "Build a Node.js API" },
        ] },
      });
      try {
        const created = await request(app).post(`/api/jobs/${gig._id}/apply`).set("Authorization", `Bearer ${candidateToken}`).send({ resumeText: "Junior developer with basic HTML and CSS project experience seeking a software role." }).expect(httpStatus.CREATED);
        expect(created.body.data.finalStatus).toBe("rejected");
        expect(created.body.data.improvementReport.items).toHaveLength(3);
        const applicationId = created.body.data.id || created.body.data._id;
        const stored = await FiltrationApplication.findById(applicationId);
        expect(stored.improvementReport.score).toBe(45);
        expect(stored.improvementReport.items).toHaveLength(3);
        const retrieved = await request(app).get(`/api/applications/${applicationId}`).set("Authorization", `Bearer ${candidateToken}`).expect(httpStatus.OK);
        expect(retrieved.body.data.improvementReport.items).toHaveLength(3);
      } finally { scoreMock.mockRestore(); }
    });
  });

  describe("Authenticated application status assistant", () => {
    let ownApplication, foreignApplication;
    beforeEach(async () => {
      const job = await FiltrationJob.create({ poster: poster._id, type: "full_time", title: "Backend Engineer", description: "Build secure backend services and APIs for the platform.", scoringConfig: { skillWeight: 0.4, experienceWeight: 0.3, stabilityWeight: 0.3 }, minResumePct: 60, status: "published", fullTimeDetails: { salaryMin: 5000, salaryMax: 10000, location: "Remote", workMode: "remote", employmentType: "permanent", experienceRequiredYears: 2 } });
      ownApplication = await FiltrationApplication.create({ job: job._id, candidate: candidate._id, resumeStatus: "passed", finalStatus: "shortlisted" });
      foreignApplication = await FiltrationApplication.create({ job: job._id, candidate: poster._id, resumeStatus: "failed", finalStatus: "rejected" });
    });

    test("should reject anonymous assistant access", async () => {
      await request(app).post("/api/assistant/status").set("X-Forwarded-For", "10.0.0.11").send({ message: "What is my application status?" }).expect(httpStatus.UNAUTHORIZED);
    });

    test("should return only the signed-in candidate's correct status", async () => {
      const res = await request(app).post("/api/assistant/status").set("X-Forwarded-For", "10.0.0.12").set("Authorization", `Bearer ${candidateToken}`).send({ message: `What is the status of application ${ownApplication._id}?` }).expect(httpStatus.OK);
      expect(res.body.data.applications).toHaveLength(1);
      expect(res.body.data.applications[0].applicationId).toBe(String(ownApplication._id));
      expect(res.body.data.applications[0].status).toBe("shortlisted");
      const audit = await AuditLog.findOne({ actor: candidate._id, action: "status_assistant.query" });
      expect(audit).toBeTruthy();
    });

    test("should not reveal another candidate's application", async () => {
      const res = await request(app).post("/api/assistant/status").set("X-Forwarded-For", "10.0.0.13").set("Authorization", `Bearer ${candidateToken}`).send({ message: `What is the status of application ${foreignApplication._id}?` }).expect(httpStatus.OK);
      expect(res.body.data.applications).toHaveLength(0);
      expect(res.body.data.answer).toContain("your account");
    });

    test("should rate limit repeated assistant requests", async () => {
      const call = () => request(app).post("/api/assistant/status").set("X-Forwarded-For", "10.0.0.14").set("Authorization", `Bearer ${candidateToken}`).send({ message: "What is my latest application status?" });
      await call().expect(httpStatus.OK);
      await call().expect(httpStatus.OK);
      await call().expect(httpStatus.OK);
      const blocked = await call().expect(httpStatus.TOO_MANY_REQUESTS);
      expect(blocked.body.message).toContain("Too many assistant requests");
    });
  });

  describe("Hiring actions and evaluation", () => {
    let job, application;

    beforeEach(async () => {
      job = await FiltrationJob.create({
        poster: poster._id,
        type: "full_time",
        title: "Landscape Designer",
        description: "Plan garden designs and green environments.",
        scoringConfig: { skillWeight: 0.4, experienceWeight: 0.3, stabilityWeight: 0.3 },
        status: "published",
        fullTimeDetails: {
          salaryMin: 5000,
          salaryMax: 10000,
          location: "New York",
          workMode: "remote",
          employmentType: "permanent",
          experienceRequiredYears: 3,
        },
      });

      application = await FiltrationApplication.create({
        job: job._id,
        candidate: candidate._id,
        resumeText: "Landscape architecture student.",
        finalStatus: "applied",
      });
    });

    test("should allow the poster to shortlist a candidate", async () => {
      const res = await request(app)
        .patch(`/api/applications/${application._id}/review`)
        .set("Authorization", `Bearer ${posterToken}`)
        .send({
          finalStatus: "shortlisted",
        })
        .expect(httpStatus.OK);

      expect(res.body.success).toBe(true);
      expect(res.body.data.finalStatus).toBe("shortlisted");
    });

    test("should record a status timeline change history", async () => {
      await request(app)
        .patch(`/api/applications/${application._id}/review`)
        .set("Authorization", `Bearer ${posterToken}`)
        .send({
          finalStatus: "shortlisted",
        });

      const dbApp = await FiltrationApplication.findById(application._id);
      expect(dbApp.statusHistory.length).toBeGreaterThan(0);
      expect(dbApp.statusHistory[0].to).toBe("shortlisted");
    });
  });
});
