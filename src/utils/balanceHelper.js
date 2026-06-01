const { transactionService } = require("../services");
const { User, JobAsset } = require("../models");
const mongoose = require("mongoose");

/**
 * Add balance to a service provider when they complete an order.
 * @param {string} userId - Service provider ID
 * @param {number} amount - Order amount
 * @param {string} orderId - Order ID
 * @param {string} description - Transaction description
 */
const addOrderCompletionBalance = async (
  userId,
  amount,
  orderId,
  description = "",
) => {
  try {
    // Use new fee structure: 10% platform fee + 2.9% Square processing fee
    const { calculateSellerPayout } = require("./feeCalculator");
    const sellerPayout = calculateSellerPayout(amount);

    const result = await transactionService.updateUserBalance(
      userId,
      sellerPayout.netAmount, // Positive amount (income) - what seller actually receives
      "sale",
      description || `Payment received for completed order`,
      {
        relatedOrderId: orderId,
        feeAmount: sellerPayout.totalFees,
        platformFee: sellerPayout.platformFee,
        squareProcessingFee: sellerPayout.squareProcessingFee,
        netAmount: sellerPayout.netAmount,
        metadata: {
          originalAmount: amount,
          platformFeePercent: 0.1, // 10%
          vatPercent: 0.0132, // 1.32% VAT
          note: "Stripe processing fees now charged on withdrawal",
          feeBreakdown: sellerPayout.breakdown,
        },
      },
    );

    return result;
  } catch (error) {
    console.error("Error adding order completion balance:", error);
    throw error;
  }
};


/**
 * Add commission to referrer or collaborator
 * @param {string} userId - User who gets commission
 * @param {number} amount - Commission amount
 * @param {string} description - Commission description
 * @param {Object} metadata - Additional metadata
 */
const addCommissionBalance = async (
  userId,
  amount,
  description,
  metadata = {},
) => {
  try {
    const result = await transactionService.updateUserBalance(
      userId,
      amount, // Positive amount (income)
      "commission",
      description,
      {
        netAmount: amount,
        metadata: metadata,
      },
    );

    return result;
  } catch (error) {
    console.error("Error adding commission balance:", error);
    throw error;
  }
};

/**
 * Add balance to user from sponsorship
 * @param {string} userId - Recipient User ID
 * @param {number} amount - Sponsorship amount (net amount after fees)
 * @param {string} purchaseId - Purchase ID
 * @param {string} senderName - Name of the sponsor (optional)
 */
const addSponsorshipBalance = async (
  userId,
  amount,
  purchaseId,
  senderName = "A fan",
) => {
  try {
    const result = await transactionService.updateUserBalance(
      userId,
      amount, // Positive amount (income)
      "sponsorship",
      `Sponsorship from ${senderName}`,
      {
        relatedPurchaseId: purchaseId,
        netAmount: amount,
        metadata: {
          purchaseId,
        },
      },
    );

    return result;
  } catch (error) {
    console.error("Error adding sponsorship balance:", error);
    throw error;
  }
};

module.exports = {
  addOrderCompletionBalance,
  addCommissionBalance,
  addSponsorshipBalance,
};
