const httpStatus = require("http-status");
const catchAsync = require("../utils/catchAsync");
const { purchaseService, stripeService } = require("../services");
const Purchase = require("../models/purchase.model");
const ApiError = require("../utils/ApiError");
const pick = require("../utils/pick");
const User = require("../models/user.model");
const logger = require("../config/logger");


/**
 * Get purchase history with search, filters, and pagination
 */
const getPurchaseHistory = catchAsync(async (req, res) => {
  const userId = req.user.id;
  const filter = pick(req.query, [
    "search",
    "status",
    "dateFrom",
    "dateTo",
    "minAmount",
    "maxAmount",
  ]);
  const options = pick(req.query, ["sortBy", "limit", "page"]);

  console.log("getPurchaseHistory Controller - userId:", userId);
  console.log("getPurchaseHistory Controller - filter:", filter);
  console.log("getPurchaseHistory Controller - options:", options);

  // Validasi user ID
  if (!userId) {
    throw new ApiError(httpStatus.UNAUTHORIZED, "User not authenticated");
  }

  const result = await purchaseService.getPurchaseHistory(
    userId,
    filter,
    options,
  );

  res.status(httpStatus.OK).json({
    success: true,
    message: "Purchase history retrieved successfully",
    data: result,
  });
});

/**
 * Get detailed purchase information
 */
const getPurchaseDetails = catchAsync(async (req, res) => {
  const { purchaseId } = req.params;
  const userId = req.user.id;

  const result = await purchaseService.getPurchaseDetails(purchaseId, userId);

  res.status(httpStatus.OK).json({
    success: true,
    message: "Purchase details retrieved successfully",
    data: result,
  });
});

/**
 * Get sales data for service providers
 */
const getSalesData = catchAsync(async (req, res) => {
  const userId = req.user.id;
  const filter = pick(req.query, [
    "search",
    "status",
    "dateFrom",
    "dateTo",
    "minAmount",
    "maxAmount",
  ]);
  const options = pick(req.query, ["sortBy", "limit", "page"]);

  const result = await purchaseService.getSalesData(userId, filter, options);

  res.status(httpStatus.OK).json({
    success: true,
    message: "Sales data retrieved successfully",
    data: result,
  });
});

/**
 * Create gig order
 */
const createGigOrder = catchAsync(async (req, res) => {
  const userId = req.user.id;
  const {
    gigId,
    packageType, // 'basic', 'standard', 'premium'
    extras = [], // array of extra service IDs
    requirements,
    totalAmount,
    deliveryTime,
  } = req.body;

  // Validate gig exists and is active
  const { gigService } = require("../services");
  const gig = await gigService.getGigById(gigId);

  if (!gig) {
    throw new ApiError(httpStatus.NOT_FOUND, "Gig not found");
  }

  if (gig.status !== "active" || !gig.isActive) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Gig is not available for purchase",
    );
  }

  if (gig.seller.toString() === userId) {
    throw new ApiError(httpStatus.BAD_REQUEST, "You cannot order your own gig");
  }

  // Validate package exists
  if (!gig.packages[packageType]) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid package type");
  }

  // Calculate expected amount
  let expectedAmount = gig.packages[packageType].price;
  let expectedDeliveryTime = gig.packages[packageType].deliveryTime;

  // Add extras cost
  for (const extraId of extras) {
    const extra = gig.gig_extras.find((e) => e._id.toString() === extraId);
    if (extra) {
      expectedAmount += extra.price;
      expectedDeliveryTime += extra.additionalTime;
    }
  }

  // Validate amount
  if (Math.abs(totalAmount - expectedAmount) > 0.01) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Amount mismatch. Expected: $${expectedAmount}, Received: $${totalAmount}`,
    );
  }

  // Create order record
  const orderData = {
    buyer: userId,
    seller: gig.seller,
    gig: gigId,
    packageType,
    packageDetails: gig.packages[packageType],
    extras: extras.map((extraId) => {
      const extra = gig.gig_extras.find((e) => e._id.toString() === extraId);
      return {
        extraId,
        title: extra.title,
        price: extra.price,
        additionalTime: extra.additionalTime,
      };
    }),
    requirements: requirements || "",
    totalAmount,
    deliveryTime: expectedDeliveryTime,
    expectedDeliveryDate: new Date(
      Date.now() + deliveryTime * 24 * 60 * 60 * 1000,
    ),
    status: "pending_payment",
    type: "gig_order",
  };

  // For now, create as completed order (later integrate with payment)
  orderData.status = "active";
  orderData.startTime = new Date();

  const Order = require("../models/order.model");
  const order = await Order.create(orderData);

  // Update gig stats
  await gigService.updateGigStats(gigId, { totalOrders: 1 });

  res.status(httpStatus.CREATED).json({
    success: true,
    message: "Gig order created successfully",
    data: order,
  });
});

/**
 * Create gig order with Stripe payment
 */
const createStripeGigOrder = catchAsync(async (req, res) => {
  const userId = req.user.id;
  const {
    gigId,
    packageType,
    extras = [],
    requirements,
    totalAmount,
    deliveryTime,
    paymentMethodId,
    savePaymentMethod = false,
    billingAddress,
  } = req.body;

  // Validate gig and calculate amount (same logic as createGigOrder)
  const { gigService } = require("../services");
  const gig = await gigService.getGigById(gigId);

  if (!gig || gig.status !== "active" || !gig.isActive) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Gig is not available for purchase",
    );
  }

  if (gig.seller.toString() === userId) {
    throw new ApiError(httpStatus.BAD_REQUEST, "You cannot order your own gig");
  }

  let expectedAmount = gig.packages[packageType].price;
  for (const extraId of extras) {
    const extra = gig.gig_extras.find((e) => e._id.toString() === extraId);
    if (extra) expectedAmount += extra.price;
  }

  if (Math.abs(totalAmount - expectedAmount) > 0.01) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Amount mismatch. Expected: $${expectedAmount}`,
    );
  }

  try {
    // Create Stripe payment intent
    const paymentIntent = await stripeService.createPaymentIntent({
      amount: Math.round(totalAmount * 100), // Convert to cents
      currency: "USD",
      paymentMethodId,
      customerId: req.user.stripeCustomerId,
      metadata: {
        type: "gig_order",
        gigId,
        packageType,
        buyerId: userId,
        sellerId: gig.seller.toString(),
      },
    });

    // Create order record
    const orderData = {
      buyer: userId,
      seller: gig.seller,
      gig: gigId,
      packageType,
      packageDetails: gig.packages[packageType],
      extras: extras.map((extraId) => {
        const extra = gig.gig_extras.find((e) => e._id.toString() === extraId);
        return {
          extraId,
          title: extra.title,
          price: extra.price,
          additionalTime: extra.additionalTime,
        };
      }),
      requirements: requirements || "",
      totalAmount,
      deliveryTime,
      expectedDeliveryDate: new Date(
        Date.now() + deliveryTime * 24 * 60 * 60 * 1000,
      ),
      status: "pending_payment",
      type: "gig_order",
      paymentDetails: {
        method: "stripe",
        paymentIntentId: paymentIntent.id,
        amount: totalAmount,
        currency: "USD",
      },
    };

    const Order = require("../models/order.model");
    const order = await Order.create(orderData);

    res.status(httpStatus.CREATED).json({
      success: true,
      message: "Gig order created with payment intent",
      data: {
        order,
        paymentIntent: {
          id: paymentIntent.id,
          clientSecret: paymentIntent.client_secret,
          status: paymentIntent.status,
        },
      },
    });
  } catch (error) {
    logger.error("Stripe gig order creation failed:", error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      "Payment processing failed",
    );
  }
});

/**
 * Create sponsorship record
 */
const createSponsorship = catchAsync(async (req, res) => {
  const userId = req.user.id;
  const {
    amount, // Total amount paid
    baseAmount, // The donation amount
    currency = "USD",
    paymentId, // PayPal Order ID
    creatorId, // Beneficiary
  } = req.body;

  if (!amount || !paymentId || !creatorId) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Missing required fields");
  }

  // Verify creator exists
  const creator = await User.findById(creatorId);
  if (!creator) {
    throw new ApiError(httpStatus.NOT_FOUND, "Creator not found");
  }

  // Create purchase record
  const purchase = await Purchase.create({
    user: userId,
    type: "sponsor",
    recipient: creatorId,
    amount: amount,
    currency,
    paymentMethod: "paypal",
    transactionId: paymentId,
    status: "completed",
    savePaymentInfo: false,
    metadata: {
      isSponsorship: true,
      baseAmount: baseAmount,
    },
  });

  // Credit the creator's wallet directly
  const creditAmount = baseAmount || amount;

  // Update user balance directly
  await User.findByIdAndUpdate(creatorId, {
    $inc: { balance: Number(baseAmount) },
  });

  // Create Sale record for the creator
  const { Sale } = require("../models");
  await Sale.create({
    type: "sponsor",
    assetId: null,
    OwnerId: creatorId,
    buyerId: userId,
    buyer: req.user.name, // Sponsor's name
    creatorName: creator.name, // Beneficiary's name
    assetTitle: "Sponsorship",
    assetPrice: amount,
    quantity: 1,
    totalAmount: baseAmount, // Record what they actually received (baseAmount)
    paymentMethod: "paypal",
    paymentId: paymentId,
    status: "completed",
  });

  res.status(httpStatus.CREATED).json({
    success: true,
    message: "Sponsorship recorded successfully",
    data: purchase,
  });
});

module.exports = {
  createGigOrder,
  createStripeGigOrder,
  createSponsorship,
  getPurchaseHistory,
  getPurchaseDetails,
  getSalesData,
};
