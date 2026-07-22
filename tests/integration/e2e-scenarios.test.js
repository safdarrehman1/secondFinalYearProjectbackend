const request = require("supertest");
const httpStatus = require("http-status");
const app = require("../../src/app");
const setupTestDB = require("../utils/setupTestDB");
const { User, Gig, Order, AppliedJobs } = require("../../src/models");
const FiltrationJob = require("../../src/modules/job-filtration/filtration-job.model");
const FiltrationApplication = require("../../src/modules/job-filtration/filtration-application.model");
const FiltrationInterview = require("../../src/modules/job-filtration/interview.model");
const { userOne, userTwo, insertUsers } = require("../fixtures/user.fixture");
const { userOneAccessToken, userTwoAccessToken } = require("../fixtures/token.fixture");

// Mock external services to prevent errors
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
  createOrder: jest.fn().mockResolvedValue({ id: "paypal_order_id", links: [] }),
  captureOrder: jest.fn().mockResolvedValue({ status: "COMPLETED" }),
  createPayment: jest.fn(),
  executePayment: jest.fn(),
  refundPayment: jest.fn(),
}));

jest.mock("../../src/services/squareService", () => ({
  createPayment: jest.fn().mockResolvedValue({ payment: { id: "square_payment_id", status: "COMPLETED" } }),
  completePayment: jest.fn(),
}));

jest.mock("../../src/services/stripe.service", () => ({
  createPaymentIntent: jest.fn().mockResolvedValue({ id: "pi_123", client_secret: "secret" }),
  confirmPaymentIntent: jest.fn(),
}));

setupTestDB();
jest.setTimeout(35000);

describe("Intelligent Hiring Platform E2E Flows", () => {
  let seller, buyer, sellerToken, buyerToken;

  beforeEach(async () => {
    await insertUsers([userOne, userTwo]);
    seller = userOne;
    buyer = userTwo;
    sellerToken = userOneAccessToken;

    const moment = require("moment");
    const tokenService = require("../../src/services/token.service");
    const { tokenTypes } = require("../../src/config/tokens");
    const config = require("../../src/config/config");
    buyerToken = tokenService.generateToken(
      buyer._id,
      moment().add(config.jwt.accessExpirationMinutes, "minutes"),
      tokenTypes.ACCESS
    );
  });

  describe("Flow 1: Freelance Gig Lifecycle & Delivery", () => {
    test("should run the full gig publication, ordering, delivery, completion, and review flow", async () => {
      // 1. Create and publish a gig
      const gig = await Gig.create({
        title: "Professional Architectural Rendering",
        category: "Architecture Design Services",
        description: "High quality realistic renders and models.",
        seller: seller._id,
        videos: ["http://example.com/video.mp4"],
        packages: {
          basic: { title: "Basic", description: "1 render", price: 50, revisions: 1 },
        },
        status: "active",
      });
      expect(gig.status).toBe("active");

      // 2. Start an order (simulate buyer creating order)
      const order = await Order.create({
        recruiterId: buyer._id,
        buyer: buyer._id,
        seller: seller._id,
        gig: gig._id,
        gigId: gig._id,
        createdBy: seller._id,
        totalAmount: 50,
        price: 50,
        status: "accepted",
        type: "gig_order",
        packageType: "basic",
        paymentMethod: "card",
      });
      expect(order.status).toBe("accepted");

      // 3. Deliver order
      const deliveryRes = await request(app)
        .post(`/v1/order/${order._id}/deliver`)
        .set("Authorization", `Bearer ${sellerToken}`)
        .send({
          message: "Here is your finished architectural rendering.",
          fileUrl: "http://example.com/rendering.jpg",
        })
        .expect(httpStatus.OK);
      expect(deliveryRes.body.status).toBe("delivered");

      // 4. Accept delivery / complete order
      const acceptRes = await request(app)
        .post(`/v1/order/${order._id}/deliver/accept`)
        .set("Authorization", `Bearer ${buyerToken}`)
        .send({ message: "Excellent work!" })
        .expect(httpStatus.OK);
      expect(acceptRes.body.status).toBe("complete");

      // Verify DB Order state
      const completedOrder = await Order.findById(order._id);
      expect(completedOrder.status).toBe("complete");

      // 5. Submit and display a review
      const reviewRes = await request(app)
        .post(`/v1/order/${order._id}/review`)
        .set("Authorization", `Bearer ${buyerToken}`)
        .send({
          buyerRating: 5,
          buyerReview: "Amazing realistic details!",
        })
        .expect(httpStatus.OK);

      const dbSeller = await User.findById(seller._id);
      expect(dbSeller.sellerMetrics.totalReviews).toBe(1);
      expect(dbSeller.sellerMetrics.averageRating).toBe(5);
    });
  });

  describe("Flow 2: Full-Time Job Lifecycle & Candidate Filtration Pipeline", () => {
    test("should execute full-time job apply, test, interview, shortlist, and rejection rules", async () => {
      // 1. Create and publish a full-time job
      const job = await FiltrationJob.create({
        poster: seller._id,
        type: "full_time",
        title: "Senior CAD Architect",
        description: "Must have AutoCAD, SketchUp, and Revit experience in building plan.",
        scoringConfig: { skillWeight: 0.4, experienceWeight: 0.3, stabilityWeight: 0.3 },
        status: "published",
        minResumePct: 60,
        minTestPct: 70,
        cooldownDays: 5,
        fullTimeDetails: {
          salaryMin: 5000,
          salaryMax: 10000,
          location: "New York",
          workMode: "remote",
          employmentType: "permanent",
          experienceRequiredYears: 3,
        },
      });
      expect(job.status).toBe("published");

      // 2. Apply with a resume
      const applyRes = await request(app)
        .post(`/api/jobs/${job._id}/apply`)
        .set("Authorization", `Bearer ${buyerToken}`)
        .send({
          resumeText: "CAD Architect with expertise in AutoCAD, SketchUp, and Revit.",
          resumeUrl: "http://example.com/resume.pdf",
        })
        .expect(httpStatus.CREATED);
      expect(applyRes.body.success).toBe(true);
      const appVal = applyRes.body.data;
      const appValId = appVal.id || appVal._id;
      expect(["applied", "under_review"]).toContain(appVal.finalStatus);

      // 3. Pass resume screening (move status manually or trigger pipeline review)
      const reviewRes = await request(app)
        .patch(`/api/applications/${appValId}/review`)
        .set("Authorization", `Bearer ${sellerToken}`)
        .send({
          finalStatus: "shortlisted",
        })
        .expect(httpStatus.OK);
      expect(reviewRes.body.data.finalStatus).toBe("shortlisted");

      // 4. Propose an interview
      const startsAt = new Date();
      startsAt.setDate(startsAt.getDate() + 2); // 2 days from now
      const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000); // 1 hour duration

      const interviewRes = await request(app)
        .post(`/api/applications/${appValId}/interviews`)
        .set("Authorization", `Bearer ${sellerToken}`)
        .send({
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
          timezone: "UTC",
          meetingLink: "https://zoom.us/test",
        })
        .expect(httpStatus.CREATED);
      expect(interviewRes.body.success).toBe(true);
      expect(interviewRes.body.data.status).toBe("proposed");

      // 5. Close job and verify rejection of new applications
      await request(app)
        .post(`/api/jobs/${job._id}/close`)
        .set("Authorization", `Bearer ${sellerToken}`)
        .send()
        .expect(httpStatus.OK);

      // Verify closed jobs reject new applications
      const candidateTwo = await User.create({
        name: "Extra Candidate",
        email: "extra@example.com",
        password: "password123",
      });

      // Generate token manually or simulate request
      const failedApplyRes = await request(app)
        .post(`/api/jobs/${job._id}/apply`)
        .set("Authorization", `Bearer ${buyerToken}`)
        .send({
          resumeText: "Another applicant applying for closed job with a resume text that contains more than fifty characters.",
          resumeUrl: "http://example.com/resume2.pdf",
        })
        .expect(httpStatus.CONFLICT);

      expect(failedApplyRes.body.message).toContain("not accepting applications");
    });
  });
});
