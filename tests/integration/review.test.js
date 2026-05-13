const request = require("supertest");
const httpStatus = require("http-status");
const app = require("../../src/app");
const setupTestDB = require("../utils/setupTestDB");
const { Order, User, Gig } = require("../../src/models");
const { userOne, userTwo, insertUsers } = require("../fixtures/user.fixture");
const {
  userOneAccessToken,
  userTwoAccessToken,
} = require("../fixtures/token.fixture");
const mongoose = require("mongoose");

// Mock external services to prevent errors
jest.mock("resend", () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: jest.fn().mockResolvedValue({ id: "email_id" }) },
  })),
}));

// Mock payment services
jest.mock("../../src/services/paypal.service", () => ({
  createOrder: jest
    .fn()
    .mockResolvedValue({ id: "paypal_order_id", links: [] }),
  captureOrder: jest.fn().mockResolvedValue({ status: "COMPLETED" }),
}));

jest.mock("../../src/services/squareService", () => ({
  createPayment: jest.fn().mockResolvedValue({
    payment: { id: "square_payment_id", status: "COMPLETED" },
  }),
}));

jest.mock("../../src/services/stripe.service", () => ({
  createPaymentIntent: jest
    .fn()
    .mockResolvedValue({ id: "pi_123", client_secret: "secret" }),
}));

// Mock libraries that might cause ESM issues
jest.mock("square", () => ({ Client: jest.fn() }));
jest.mock("@apimatic/axios-client-adapter", () => ({}));
jest.mock("axios", () => ({}));
jest.mock(
  "groq-sdk",
  () =>
    function () {
      return { chat: { completions: { create: jest.fn() } } };
    },
);

// Mock PayPal SDK to prevent initialization errors in payment.route.js
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

setupTestDB();
jest.setTimeout(30000);

describe("Review Routes Integration", () => {
  let buyer, seller, gig, order, buyerAccessToken;

  beforeEach(async () => {
    try {
      // Setup users
      await insertUsers([userOne, userTwo]);
      buyer = userOne;
      seller = userTwo;
      buyerAccessToken = userOneAccessToken;

      console.log("Seller Object:", seller);
      if (!seller || !seller._id)
        throw new Error("Seller not defined properly");

      // Create a mock gig
      gig = await Gig.create({
        title: "Test Gig Music Production",
        coverImage: "http://example.com/image.jpg",
        seller: seller._id, // Field name is seller, not owner
        price: 50,
        deliveryTime: 3,
        category: "music-production", // Valid enum
        status: "active",
        description: "A test gig description",
        videos: ["http://example.com/video.mp4"], // Required field
        packages: {
          basic: {
            title: "Basic Package",
            description: "Basic description",
            price: 50,
          },
        },
      });

      // Create a completed order
      order = await Order.create({
        recruiterId: buyer._id,
        createdBy: seller._id,
        gig: gig._id,
        type: "gig_order",
        status: "complete", // Start as complete to allow reviewing
        price: 50,
        totalAmount: 55,
        title: "Test Order",
        paymentStatus: "paid",
      });
      console.log("Test Setup Complete. Order ID:", order._id);
    } catch (e) {
      console.error("Test Setup Failed:", e);
    }
  });

  describe("POST /v1/order/:orderId/review", () => {
    test("should update seller metrics when buyer submits review with 'buyerRating' payload (reproducing issue)", async () => {
      // The user reported submitting `buyerRating: 5` as a buyer.
      // This technically means "Rating OF Buyer", but user intends to rate Seller.
      // The backend should be smart enough to map this or we verify that it currently FAILS.

      const res = await request(app)
        .post(`/v1/order/${order._id}/review`)
        .set("Authorization", `Bearer ${buyerAccessToken}`)
        .send({
          // Payload as reported by user
          buyerRating: 5,
          buyerReview: "Great work!",
        })
        .expect(httpStatus.OK);

      // Reload seller to check metrics
      const dbSeller = await User.findById(seller._id);

      // We assume correct behavior is that the SELLER gets rated.
      // If the code is buggy, this will be 0.
      expect(dbSeller.sellerMetrics).toBeDefined();
      expect(dbSeller.sellerMetrics.totalReviews).toBe(1);
      expect(dbSeller.sellerMetrics.averageRating).toBe(5);
    });

    test("should update seller metrics when buyer submits review with correct 'sellerRating' payload", async () => {
      // This is the "correct" usage
      const res = await request(app)
        .post(`/v1/order/${order._id}/review`)
        .set("Authorization", `Bearer ${buyerAccessToken}`)
        .send({
          sellerRating: 4,
          sellerReview: "Good job on this work!", // >10 chars
        })
        .expect(httpStatus.OK);

      const dbSeller = await User.findById(seller._id);

      // Note: setupTestDB clears DB, but beforeEach runs.
      // So this is a new run.
      expect(dbSeller.sellerMetrics.totalReviews).toBe(1);
      expect(dbSeller.sellerMetrics.averageRating).toBe(4);
    });
  });
});
