const request = require("supertest");
const httpStatus = require("http-status");
const app = require("../../src/app");
const setupTestDB = require("../utils/setupTestDB");
const { User } = require("../../src/models");
const FiltrationJob = require("../../src/modules/job-filtration/filtration-job.model");
const FiltrationApplication = require("../../src/modules/job-filtration/filtration-application.model");
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
