const httpStatus = require("http-status");
const { Purchase, Sale } = require("../models");
const ApiError = require("../utils/ApiError");
const moment = require("moment");
const mongoose = require("mongoose");

/**
 * Get purchase history for a user with search, filters, and pagination
 * @param {string} userId - User ID
 * @param {Object} filter - Search and filter options
 * @param {Object} options - Pagination options
 * @returns {Promise<Object>}
 */
const getPurchaseHistory = async (userId, filter = {}, options = {}) => {
  try {
    console.log("getPurchaseHistory called with userId:", userId);

    if (!userId) {
      throw new ApiError(httpStatus.BAD_REQUEST, "User ID is required");
    }

    const {
      search = "",
      status,
      dateFrom,
      dateTo,
      minAmount,
      maxAmount,
      sortBy = "createdAt:desc",
      limit = 10,
      page = 1,
    } = { ...filter, ...options };

    const query = { user: userId };

    if (status) {
      query.status = status;
    }

    if (dateFrom || dateTo) {
      query.createdAt = {};
      if (dateFrom) {
        query.createdAt.$gte = moment(dateFrom).startOf("day").toDate();
      }
      if (dateTo) {
        query.createdAt.$lte = moment(dateTo).endOf("day").toDate();
      }
    }

    if (minAmount || maxAmount) {
      query.amount = {};
      if (minAmount) {
        query.amount.$gte = Number(minAmount);
      }
      if (maxAmount) {
        query.amount.$lte = Number(maxAmount);
      }
    }

    const offset = (Number(page) - 1) * Number(limit);

    // Fetch both Purchase documents and Sale documents for this user as buyer
    const [purchases, sales] = await Promise.all([
      Purchase.find(query)
        .populate({ path: "recipient", select: "name profilePicture" })
        .populate({ path: "projectId", select: "projectTitle" })
        .populate({ path: "user", select: "name email" })
        .lean(),
      Sale.find({ buyerId: userId }).lean(),
    ]);

    // Transform Purchase items
    const purchaseResults = purchases.map((purchase) => {
      let assetTitle = purchase.metadata?.assetTitle || "Unknown Item";
      let assetType = "Unknown";
      let creatorName = purchase.metadata?.creatorName || "-";
      let creatorImage = null;

      if (purchase.type === "project") {
        assetTitle = purchase.metadata?.assetTitle || purchase.projectId?.projectTitle || "Project Creation";
        assetType = "Project";
      } else if (purchase.type === "project_extension") {
        assetTitle = purchase.projectId?.projectTitle || "Project Extension";
        assetType = "Project Extension";
      } else if (purchase.type === "sponsor") {
        assetTitle = "Sponsorship";
        assetType = "Sponsor";
        creatorName = purchase.recipient?.name || "Unknown";
        creatorImage = purchase.recipient?.profilePicture || null;
      }

      return {
        id: purchase._id.toString(),
        assetId: purchase.metadata?.assetId || purchase.projectId?._id || purchase.recipient?._id || purchase._id.toString(),
        assetTitle: assetTitle,
        assetImage: null,
        assetType: assetType,
        creatorName: creatorName,
        creatorId: purchase.recipient?._id || null,
        creatorImage: creatorImage,
        purchaseDate: purchase.createdAt || new Date(),
        type: purchase.type || "music",
        amount: purchase.amount || 0,
        totalAmount: purchase.amount || 0,
        status: purchase.status || "completed",
        paymentMethod: purchase.paymentMethod || "paypal",
        paymentId: purchase.squarePaymentId || purchase.stripePaymentIntentId || null,
        licenseType: purchase.metadata?.licenseType || "Standard License",
        transactionId: purchase.transactionId || `TXN_${purchase._id}`,
        canDownload: false,
        assetDetails: {},
      };
    });

    // Transform Sale items
    const saleResults = sales.map((sale) => ({
      id: sale._id.toString(),
      assetId: sale.assetId ? sale.assetId.toString() : sale._id.toString(),
      assetTitle: sale.assetTitle || "Purchased Asset",
      assetImage: null,
      assetType: "Asset",
      creatorName: sale.creatorName || "Artist",
      creatorId: sale.OwnerId ? sale.OwnerId.toString() : null,
      creatorImage: null,
      purchaseDate: sale.createdAt || sale.created_at || new Date(),
      type: "music",
      amount: sale.totalAmount || sale.assetPrice || 0,
      totalAmount: sale.totalAmount || sale.assetPrice || 0,
      status: sale.status || "completed",
      paymentMethod: sale.paymentMethod || "paypal",
      paymentId: sale.paymentId || null,
      licenseType: sale.licenseType || "Standard License",
      transactionId: sale.paymentId || `TXN_${sale._id}`,
      canDownload: false,
      assetDetails: {},
    }));

    // Merge and deduplicate by paymentId or ID
    const mergedMap = new Map();
    [...purchaseResults, ...saleResults].forEach((item) => {
      const key = item.paymentId || item.id;
      if (!mergedMap.has(key)) {
        mergedMap.set(key, item);
      }
    });

    let allResults = Array.from(mergedMap.values());

    if (search) {
      const queryStr = search.toLowerCase();
      allResults = allResults.filter(
        (item) =>
          item.assetTitle.toLowerCase().includes(queryStr) ||
          item.creatorName.toLowerCase().includes(queryStr),
      );
    }

    if (status) {
      allResults = allResults.filter((item) => item.status === status);
    }

    allResults.sort((a, b) => new Date(b.purchaseDate).getTime() - new Date(a.purchaseDate).getTime());

    const totalResults = allResults.length;
    const totalPages = Math.ceil(totalResults / Number(limit)) || 1;
    const paginatedResults = allResults.slice(offset, offset + Number(limit));

    return {
      results: paginatedResults,
      page: Number(page),
      limit: Number(limit),
      totalPages,
      totalResults,
      hasNextPage: Number(page) < totalPages,
      hasPrevPage: Number(page) > 1,
    };
  } catch (error) {
    console.error("Error in getPurchaseHistory:", error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Error fetching purchase history: ${error.message}`,
    );
  }
};

/**
 * Get detailed purchase information
 * @param {string} purchaseId - Purchase ID
 * @param {string} userId - User ID (for security check)
 * @returns {Promise<Object>}
 */
const getPurchaseDetails = async (purchaseId, userId) => {
  try {
    const purchase = await Purchase.findOne({ _id: purchaseId, user: userId })
      .populate({
        path: "projectId",
        select: "projectTitle",
      })
      .populate({
        path: "recipient",
        select: "name email profilePicture",
      })
      .populate({
        path: "user",
        select: "name email",
      })
      .lean();

    if (!purchase) {
      throw new ApiError(httpStatus.NOT_FOUND, "Purchase not found");
    }

    let assetTitle = "Unknown Item";
    let assetType = "Unknown";
    if (purchase.type === "project") {
      assetTitle = purchase.projectId?.projectTitle || "Project Creation";
      assetType = "Project";
    } else if (purchase.type === "project_extension") {
      assetTitle = purchase.projectId?.projectTitle
        ? `${purchase.projectId.projectTitle}`
        : "Project Extension";
      assetType = "Project Extension";
    } else if (purchase.type === "sponsor") {
      assetTitle = "Sponsorship";
      assetType = "Sponsor";
    }

    return {
      id: purchase._id,
      assetId: purchase.projectId?._id || purchase.recipient?._id || null,
      assetTitle,
      assetType,
      creatorName: purchase.recipient?.name || "-",
      creatorId: purchase.recipient?._id || null,
      creatorEmail: purchase.recipient?.email || null,
      purchaseDate: purchase.createdAt,
      amount: purchase.amount,
      totalAmount: purchase.amount,
      status: purchase.status,
      paymentMethod: purchase.paymentMethod,
      paymentId: purchase.squarePaymentId,
      transactionId: purchase.transactionId,
      canDownload: false,
      assetDetails: {},
      metadata: purchase.metadata,
    };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    console.error("Error fetching purchase details:", error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      "Error fetching purchase details",
    );
  }
};

/**
 * Get sales data for sponsors/creators
 * @param {string} userId - Creator user ID
 * @param {Object} filter - Search and filter options
 * @param {Object} options - Pagination options
 * @returns {Promise<Object>}
 */
const getSalesData = async (userId, filter = {}, options = {}) => {
  const {
    search = "",
    status,
    dateFrom,
    dateTo,
    minAmount,
    maxAmount,
    sortBy = "createdAt:desc",
    limit = 10,
    page = 1,
  } = { ...filter, ...options };

  const query = { OwnerId: userId };

  if (search) {
    query.$or = [
      { assetTitle: { $regex: search, $options: "i" } },
      { buyer: { $regex: search, $options: "i" } },
    ];
  }

  if (status) {
    query.status = status;
  }

  if (dateFrom || dateTo) {
    query.createdAt = {};
    if (dateFrom) {
      query.createdAt.$gte = moment(dateFrom).startOf("day").toDate();
    }
    if (dateTo) {
      query.createdAt.$lte = moment(dateTo).endOf("day").toDate();
    }
  }

  if (minAmount || maxAmount) {
    query.totalAmount = {};
    if (minAmount) {
      query.totalAmount.$gte = Number(minAmount);
    }
    if (maxAmount) {
      query.totalAmount.$lte = Number(maxAmount);
    }
  }

  const offset = (page - 1) * limit;

  const [sales, totalResults] = await Promise.all([
    Sale.find(query)
      .populate({
        path: "buyerId",
        select: "name email profilePicture",
      })
      .populate({
        path: "OwnerId",
        select: "name email",
      })
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip(offset)
      .lean(),
    Sale.countDocuments(query),
  ]);

  const results = sales.map((sale) => {
    const buyerData = sale.buyerId || {};
    return {
      id: sale._id,
      assetId: sale.assetId || null,
      assetTitle: sale.assetTitle || "Unknown Asset",
      buyerName: buyerData.name || sale.buyer || "Unknown Buyer",
      buyerId: buyerData._id || sale.buyerId,
      buyerEmail: buyerData.email || null,
      sellerName: sale.OwnerId?.name || "Unknown Seller",
      saleDate: sale.createdAt,
      amount: sale.assetPrice || 0,
      quantity: sale.quantity || 1,
      totalAmount: sale.totalAmount || 0,
      status: sale.status || "completed",
      paymentMethod: sale.paymentMethod || "unknown",
      paymentId: sale.paymentId,
    };
  });

  const totalPages = Math.ceil(totalResults / limit);

  const earningsAgg = await Sale.aggregate([
    {
      $match: {
        OwnerId: new mongoose.Types.ObjectId(userId),
        status: "completed",
      },
    },
    {
      $group: {
        _id: null,
        total: { $sum: "$totalAmount" },
        count: { $sum: 1 },
      },
    },
  ]);

  const summary = {
    totalEarnings: earningsAgg[0]?.total || 0,
    totalSales: earningsAgg[0]?.count || 0,
    completedDeals: earningsAgg[0]?.count || 0,
  };

  return {
    results,
    page: Number(page),
    limit: Number(limit),
    totalPages,
    totalResults,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
    summary,
  };
};

module.exports = {
  getPurchaseHistory,
  getPurchaseDetails,
  getSalesData,
};
