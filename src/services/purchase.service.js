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

    // Validasi userId
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

    // Build query - menggunakan field 'user' dari model Purchase
    const query = { user: userId };

    // Filter by status
    if (status) {
      query.status = status;
    }

    // Filter by date range
    if (dateFrom || dateTo) {
      query.createdAt = {};
      if (dateFrom) {
        query.createdAt.$gte = moment(dateFrom).startOf("day").toDate();
      }
      if (dateTo) {
        query.createdAt.$lte = moment(dateTo).endOf("day").toDate();
      }
    }

    // Filter by amount range
    if (minAmount || maxAmount) {
      query.amount = {};
      if (minAmount) {
        query.amount.$gte = Number(minAmount);
      }
      if (maxAmount) {
        query.amount.$lte = Number(maxAmount);
      }
    }

    console.log("Final query:", JSON.stringify(query, null, 2));

    // Parse sort
    const sort = {};
    if (sortBy) {
      const [field, order] = sortBy.split(":");
      sort[field] = order === "desc" ? -1 : 1;
    }

    const offset = (page - 1) * limit;

    // Get total count first
    const totalResults = await Purchase.countDocuments(query);
    console.log("Total purchases found for user:", totalResults);

    // Jika tidak ada data, langsung return empty result
    if (totalResults === 0) {
      return {
        results: [],
        page: Number(page),
        limit: Number(limit),
        totalPages: 0,
        totalResults: 0,
        hasNextPage: false,
        hasPrevPage: false,
      };
    }

    // Get purchases dengan populate
    const purchases = await Purchase.find(query)
      .populate({
        path: "recipient",
        select: "name profilePicture",
      })
      .populate({
        path: "projectId",
        select: "projectTitle",
      })
      .populate({
        path: "user",
        select: "name email",
      })
      .sort(sort)
      .limit(Number(limit))
      .skip(offset)
      .lean();

    console.log("Raw purchases retrieved:", purchases.length);

    // Debug: Log structure of first purchase if exists
    if (purchases.length > 0) {
      console.log("Sample purchase structure:", {
        id: purchases[0]._id,
        type: purchases[0].type,
        projectId: purchases[0].projectId?._id,
        recipientId: purchases[0].recipient?._id,
      });
    }

    // Search by project title or recipient name
    let filteredPurchases = purchases;
    if (search) {
      filteredPurchases = purchases.filter((purchase) => {
        const projectTitle = purchase.projectId?.projectTitle || "";
        const recipientName = purchase.recipient?.name || "";
        return (
          projectTitle.toLowerCase().includes(search.toLowerCase()) ||
          recipientName.toLowerCase().includes(search.toLowerCase())
        );
      });
    }

    // Transform data for response
    const results = filteredPurchases.map((purchase) => {
      let assetTitle = "Unknown Item";
      let assetType = "Unknown";
      let creatorName = "-";
      let creatorImage = null;
      let primaryImage = null;

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
        creatorName = purchase.recipient?.name || "Unknown";
        creatorImage = purchase.recipient?.profilePicture || null;
      }

      return {
        id: purchase._id,
        assetId: purchase.projectId?._id || purchase.recipient?._id || null,
        assetTitle: assetTitle,
        assetImage: primaryImage,
        assetType: assetType,
        creatorName: creatorName,
        creatorId: purchase.recipient?._id || null,
        creatorImage: creatorImage, // Added creator image
        purchaseDate: purchase.createdAt,
        type: purchase.type || "project", // Add type
        amount: purchase.amount || 0,
        totalAmount: purchase.amount || 0,
        status: purchase.status || "unknown",
        paymentMethod: purchase.paymentMethod || "unknown",
        paymentId: purchase.squarePaymentId || null,
        transactionId: purchase.transactionId || null,
        canDownload: false,
        assetDetails: {},
      };
    });

    const totalPages = Math.ceil(totalResults / limit);

    const response = {
      results,
      page: Number(page),
      limit: Number(limit),
      totalPages,
      totalResults,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    };

    console.log("Final response summary:", {
      resultsCount: results.length,
      totalResults,
      totalPages,
      page,
      limit,
    });

    return response;
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
 * Generate secure download URL for purchased asset
 * @param {string} purchaseId - Purchase ID
 * @param {string} userId - User ID
 * @returns {Promise<Object>}
 */
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

  // Build query for sales where user is the owner/creator
  const query = { OwnerId: userId };

  // Search by asset name or buyer name
  if (search) {
    query.$or = [
      { assetTitle: { $regex: search, $options: "i" } },
      { buyer: { $regex: search, $options: "i" } },
    ];
  }

  // Filter by status
  if (status) {
    query.status = status;
  }

  // Filter by date range
  if (dateFrom || dateTo) {
    query.createdAt = {};
    if (dateFrom) {
      query.createdAt.$gte = moment(dateFrom).startOf("day").toDate();
    }
    if (dateTo) {
      query.createdAt.$lte = moment(dateTo).endOf("day").toDate();
    }
  }

  // Filter by amount range
  if (minAmount || maxAmount) {
    query.totalAmount = {};
    if (minAmount) {
      query.totalAmount.$gte = Number(minAmount);
    }
    if (maxAmount) {
      query.totalAmount.$lte = Number(maxAmount);
    }
  }

  // Parse sort
  const sort = {};
  if (sortBy) {
    const [field, order] = sortBy.split(":");
    sort[field] = order === "desc" ? -1 : 1;
  }

  const offset = (page - 1) * limit;

  try {
    const [sales, totalResults] = await Promise.all([
      Sale.find(query)
        .populate({
          path: "buyerId",
          select: "name email profilePicture",
        })
        .populate({
          path: "OwnerId",
          select: "name",
        })
        .sort(sort)
        .limit(limit)
        .skip(offset)
        .lean(),
      Sale.countDocuments(query),
    ]);

    // Transform data for response
    const results = sales.map((sale) => {
      const buyerData = sale.buyerId || {};

      let assetType = "Unknown";
      if (sale.type === "sponsor") {
        assetType = "Sponsorship";
      } else if (sale.type === "project") {
        assetType = "Project";
      }

      return {
        id: sale._id,
        assetId: sale.assetId || null,
        assetTitle: sale.assetTitle || "Unknown Asset",
        assetImage: null,
        assetType,
        buyerName: buyerData.name || sale.buyer || "Unknown Buyer",
        buyerId: buyerData._id || sale.buyerId,
        buyerEmail: buyerData.email,
        buyerImage: buyerData.profilePicture || null,
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

    // Calculate summary statistics
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
  } catch (error) {
    console.error("Error in getSalesData:", error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Error fetching sales data: ${error.message}`,
    );
  }
};

module.exports = {
  getPurchaseHistory,
  getPurchaseDetails,
  getSalesData,
};
