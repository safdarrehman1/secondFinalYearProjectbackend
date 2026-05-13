const request = require("supertest");

// Mock resend before requiring app since it is initialized at module level
jest.mock("resend", () => {
  return {
    Resend: class Resend {
      constructor() {
        this.emails = {
          send: jest.fn().mockResolvedValue(true),
        };
      }
    },
  };
});

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

jest.mock("groq-sdk", () => {
  return class Groq {
    chat = { completions: { create: jest.fn() } };
  };
});

// Mock payment services to avoid syntax errors and external calls
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

const mongoose = require("mongoose");
const moment = require("moment");
const httpStatus = require("http-status");
const app = require("../../src/app");
const setupTestDB = require("../utils/setupTestDB");
const { Order, User, Gig } = require("../../src/models");
const { userOne, userTwo, insertUsers } = require("../fixtures/user.fixture");
const config = require("../../src/config/config");
const { tokenTypes } = require("../../src/config/tokens");
const tokenService = require("../../src/services/token.service");

setupTestDB();
jest.setTimeout(30000);

describe("Order Routes Integration", () => {
  let seller;
  let buyer;
  let gig;
  let order;
  let buyerAccessToken;

  beforeEach(async () => {
    // Setup Users
    await insertUsers([userOne, userTwo]);
    seller = userOne;
    buyer = userTwo;

    // Generate token for buyer
    const accessTokenExpires = moment().add(
      config.jwt.accessExpirationMinutes,
      "minutes",
    );
    buyerAccessToken = tokenService.generateToken(
      buyer._id,
      accessTokenExpires,
      tokenTypes.ACCESS,
    );

    // Create Gig
    gig = await Gig.create({
      title: "Test Gig for Metrics",
      category: "music-production",
      description: "This is a test gig description that is long enough.",
      seller: seller._id,
      videos: ["http://example.com/video.mp4"],
      packages: {
        basic: {
          title: "Basic",
          description: "Desc",
          price: 10,
          revisions: 1,
          features: ["feat"],
        },
        standard: {
          title: "Standard",
          description: "Desc",
          price: 20,
          revisions: 2,
          features: ["feat"],
        },
        premium: {
          title: "Premium",
          description: "Desc",
          price: 30,
          revisions: 3,
          features: ["feat"],
        },
      },
    });

    // Create Order
    order = await Order.create({
      recruiterId: buyer._id,
      buyer: buyer._id,
      seller: seller._id,
      gig: gig._id,
      gigId: gig._id,
      createdBy: seller._id, // Assuming createdBy represents the seller/provider in this context
      totalAmount: 50,
      price: 50,
      status: "active",
      type: "gig_order",
      packageType: "basic",
      paymentMethod: "card",
    });
  });

  describe("POST /v1/order/:orderId/deliver/accept", () => {
    test("should update totalOrders for both buyer and seller when order is completed", async () => {
      const res = await request(app)
        .post(`/v1/order/${order._id}/deliver/accept`)
        .set("Authorization", `Bearer ${buyerAccessToken}`)
        .send({ message: "Order accepted" })
        .expect(httpStatus.OK);

      // Verify order status
      const dbOrder = await Order.findById(order._id);
      expect(dbOrder.status).toBe("complete");

      // Verify User Metrics
      const dbSeller = await User.findById(seller._id);
      const dbBuyer = await User.findById(buyer._id);

      // Check seller metrics
      expect(dbSeller.sellerMetrics).toBeDefined();
      expect(dbSeller.sellerMetrics.totalOrders).toBe(1);

      // Check buyer metrics
      expect(dbBuyer.buyerMetrics).toBeDefined();
      expect(dbBuyer.buyerMetrics.totalOrders).toBe(1);
    });

    test("should update metrics for music order (no gig)", async () => {
      // Create music order without gig
      const musicOrder = await Order.create({
        recruiterId: buyer._id,
        buyer: buyer._id,
        seller: seller._id,
        createdBy: seller._id,
        totalAmount: 100,
        price: 100,
        status: "active",
        type: "music_order",
        title: "Custom Music Project",
        paymentMethod: "stripe",
      });

      const res = await request(app)
        .post(`/v1/order/${musicOrder._id}/deliver/accept`)
        .set("Authorization", `Bearer ${buyerAccessToken}`)
        .send({ message: "Music received" })
        .expect(httpStatus.OK);

      const dbSeller = await User.findById(seller._id);
      // specific test case: existing gig order + this music order = 2 total orders
      expect(dbSeller.sellerMetrics.totalOrders).toBe(1);
    });
  });

  describe("PUT /v1/order/:orderId/status", () => {
    test("should update metrics when status is manually set to complete", async () => {
      const res = await request(app)
        .put(`/v1/order/${order._id}/status`)
        .set("Authorization", `Bearer ${buyerAccessToken}`)
        .send({ status: "complete", message: "Manually completed" })
        .expect(httpStatus.OK);

      const dbSeller = await User.findById(seller._id);
      expect(dbSeller.sellerMetrics.totalOrders).toBe(1);
    });
  });
});
