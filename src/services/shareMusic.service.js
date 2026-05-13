const {
  ShareMusicAsset,
  ShareMusicCreation,
  Cart,
  Sale,
  UserSpace,
  User,
  Purchase,
} = require("../models");
const ApiError = require("../utils/ApiError");
const notificationService = require("./notification.service");
const { ObjectId } = require("mongodb");
const mongoose = require("mongoose");

const interleaveByAuthor = (items) => {
  if (!items || items.length <= 1) return items;

  // Group items by author
  const groups = {};
  items.forEach((item) => {
    const authorId = item.createdBy.toString();
    if (!groups[authorId]) {
      groups[authorId] = [];
    }
    groups[authorId].push(item);
  });

  // Sort author groups by their highest priority item
  const sortedAuthorIds = Object.keys(groups).sort((a, b) => {
    const scoreA = groups[a][0].priorityScore || 0;
    const scoreB = groups[b][0].priorityScore || 0;
    return scoreB - scoreA;
  });

  const interleaved = [];
  const totalItems = items.length;

  // Round-robin through all available authors to ensure diversity
  while (interleaved.length < totalItems) {
    let addedInThisPass = false;
    for (const authorId of sortedAuthorIds) {
      if (groups[authorId].length > 0) {
        // Avoid consecutive repeats from the same author at pass transitions if possible
        if (
          interleaved.length > 0 &&
          interleaved[interleaved.length - 1].createdBy.toString() === authorId
        ) {
          // If other authors still have items in this pass, we can skip and come back
          const otherAuthorsAvailable = sortedAuthorIds.some(
            (id) => id !== authorId && groups[id].length > 0,
          );
          if (otherAuthorsAvailable) {
            continue;
          }
        }

        interleaved.push(groups[authorId].shift());
        addedInThisPass = true;
      }
    }
    if (!addedInThisPass) break;
  }

  return interleaved;
};

/**
 * Create a music asset
 * @param {Object} body
 * @returns {Promise<Job>}
 */
const shareAsset = async (body) => {
  // Extract file type from uploadAsset URL if present
  if (body.uploadAsset) {
    if (Array.isArray(body.uploadAsset) && body.uploadAsset.length > 0) {
      // Map extensions and join uniquely
      const extensions = body.uploadAsset
        .map((url) => {
          if (url && url.includes(".")) {
            return url.split(".").pop().toLowerCase();
          }
          return "";
        })
        .filter(Boolean);
      body.fileType = [...new Set(extensions)].join(", ");
    } else if (
      typeof body.uploadAsset === "string" &&
      body.uploadAsset.includes(".")
    ) {
      const fileExtension = body.uploadAsset.split(".").pop().toLowerCase();
      body.fileType = fileExtension;
    }
  }

  return ShareMusicAsset.create(body);
};

/**
 * Get Music Assets by userId
 * @param {string} userId
 * @returns {Promise<User>}
 */
const updateAsset = async (assetId, body) => {
  // Extract file type from uploadAsset URL if present
  if (body.uploadAsset && body.uploadAsset.includes(".")) {
    const fileExtension = body.uploadAsset.split(".").pop().toLowerCase();
    body.fileType = fileExtension;
  }

  return ShareMusicAsset.findByIdAndUpdate(assetId, { ...body }, { new: true });
};

/**
 * Get Music Assets by userId
 * @param {string} userId
 * @returns {Promise<User>}
 */
const getAssets = async (createdBy) => {
  const creatorId = new mongoose.Types.ObjectId(createdBy);

  const contributors = await User.find({ _id: creatorId }).lean();
  const assets = await ShareMusicAsset.find({ createdBy: creatorId }).lean();

  return assets.map((asset) => ({
    ...asset,
    contributors,
  }));
};

const getAssetsById = async (id, userId) => {
  const asset = await ShareMusicAsset.findById(id);
  if (!asset) return null;

  const userSpace = await UserSpace.findOne({
    createdBy: asset.createdBy,
  }).lean();

  const obj = asset.toObject();

  const userName = `${(userSpace && userSpace.firstName) || ""} ${
    (userSpace && userSpace.lastName) || ""
  }`.trim();
  const creationOccupation = userSpace
    ? userSpace.creationOccupation || []
    : [];

  // Check if user has purchased this asset
  let hasPurchased = false;
  let isOwner = false;
  let isFollowing = false;
  let isBookmarked = false;

  if (userId) {
    // Check if user is the owner
    isOwner = userId === asset.createdBy.toString();

    // Check if user has purchased this asset (only if not owner)
    if (!isOwner) {
      const { Sale } = require("../models");
      const purchase = await Sale.findOne({
        assetId: id,
        buyerId: userId,
        status: "completed",
      });
      hasPurchased = !!purchase;
    }

    // Check if user is following the creator
    const user = await User.findById(userId).select("following collections");
    if (user) {
      if (Array.isArray(user.following)) {
        isFollowing = user.following.some(
          (followingId) =>
            followingId.toString() === asset.createdBy.toString(),
        );
      }
      if (Array.isArray(user.collections)) {
        isBookmarked = user.collections.some(
          (collectionId) => collectionId.toString() === id.toString(),
        );
      }
    }
  }

  // Create base response object without sensitive fields
  const baseResponse = {
    id: obj._id.toString(),
    // Map database fields to frontend expected fields
    songName: obj.title || "",
    creationOccupation: creationOccupation,
    musicImage:
      obj.assetImages && obj.assetImages.length > 0 ? obj.assetImages[0] : "",
    commercialUsePrice: obj.commercialLicensePrice || 0,
    personalUsePrice: obj.personalLicensePrice || 0,
    // Additional fields that frontend expects
    musicStyle: obj.category || "",
    musicMood: obj.subcategory || "",
    musicInstrument:
      obj.softwareTools && obj.softwareTools.length > 0
        ? obj.softwareTools.join(", ")
        : "",
    tags: obj.tags || [],
    myRole: ["Producer"], // Default role for music assets
    singerName: userName || "",
    composerName: userName || "",
    fileSize: obj.fileSize || 0,
    fileType: (() => {
      // If fileType is already set, use it
      if (obj.fileType && obj.fileType.trim()) {
        return obj.fileType;
      }
      // Otherwise, extract from uploadAsset URL for backward compatibility
      if (Array.isArray(obj.uploadAsset) && obj.uploadAsset.length > 0) {
        const exts = obj.uploadAsset
          .map((u) => u.split(".").pop().toLowerCase())
          .filter(Boolean);
        return [...new Set(exts)].join(", ");
      } else if (
        typeof obj.uploadAsset === "string" &&
        obj.uploadAsset.includes(".")
      ) {
        return obj.uploadAsset.split(".").pop().toLowerCase();
      }
      return "";
    })(), // Safe to expose - just the extension
    // Keep original fields for backward compatibility (non-sensitive)
    title: obj.title,
    assetImages: obj.assetImages,
    commercialLicensePrice: obj.commercialLicensePrice,
    personalLicensePrice: obj.personalLicensePrice,
    extendedCommercialPrice: obj.extendedCommercialPrice,
    gameEnginePrice: obj.gameEnginePrice,
    broadcastFilmPrice: obj.broadcastFilmPrice,
    extendedRedistributionPrice: obj.extendedRedistributionPrice,
    educationPrice: obj.educationPrice,
    description: obj.description,
    category: obj.category,
    subcategory: obj.subcategory,
    embeds: obj.embeds,
    additionalInformation: obj.additionalInformation,
    basicParametersText: obj.basicParametersText,
    classificationParametersText: obj.classificationParametersText,
    likes: obj.likes,
    status: obj.status,
    views: obj.views?.length || 0,
    createdBy: obj.createdBy,
    updatedBy: obj.updatedBy,
    comments: obj.comments,
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt,
    isFree: obj.isFree,
    softwareTools: obj.softwareTools,
    // User info
    profilePicture: (userSpace && userSpace.profilePicture) || "",
    hiring: (userSpace && userSpace.hiring) || "",
    userName: userName,
    // Purchase status flags
    hasPurchased: hasPurchased,
    // Purchase status flags
    hasPurchased: hasPurchased,
    isOwner: isOwner,
    isFollowing: isFollowing,
    isBookmarked: isBookmarked,
    location: `${userSpace?.address?.split(",")?.[0]}, ${userSpace?.city}`,
  };

  // Only add sensitive asset URLs if user has legitimate access AND is making an authenticated download request
  // For regular viewing, we never expose URLs even to owners for maximum security
  if (isOwner || hasPurchased) {
    const assetUrl = obj.uploadAsset || [];
    // Ensure we handle backward compatibility where it might be a single string from older db entries
    const uploadAssetVal = Array.isArray(assetUrl) ? assetUrl : [assetUrl];
    return {
      ...baseResponse,
      music: uploadAssetVal.length > 0 ? uploadAssetVal[0] : "", // Only for authorized users (keep single string backward compatible)
      audioSrc: uploadAssetVal.length > 0 ? uploadAssetVal[0] : "", // Only for authorized users
      musicAudio: uploadAssetVal.length > 0 ? uploadAssetVal[0] : "", // Only for authorized users
      uploadAsset: assetUrl, // Only for authorized users, returning the actual array/string
    };
  } else {
    // For ALL users (including owners), completely omit these fields for security
    return baseResponse;
  }
};

const getAllAssets = async (userId = null, filters = {}) => {
  const TARGET_COUNT = 30;
  const { category, search, minPrice, maxPrice, fileTypes, minPoly, maxPoly } =
    filters;

  const isFilterApplied = !!(
    (category && category !== "All") ||
    search ||
    (fileTypes && fileTypes.length > 0) ||
    minPrice !== undefined ||
    maxPrice !== undefined ||
    minPoly !== undefined ||
    maxPoly !== undefined
  );

  // Get blockedUsers if userId is provided
  let blockedUsers = [];
  if (userId) {
    const user = await User.findById(userId).select("blockedUsers");
    if (user && Array.isArray(user.blockedUsers)) {
      blockedUsers = user.blockedUsers.map(
        (id) => new mongoose.Types.ObjectId(id),
      );
    }
  }

  // 1. Initial Match Stage
  const matchStage = {};

  if (category && category !== "All") {
    if (Array.isArray(category)) {
      matchStage.category = {
        $in: category.map((c) => new RegExp(`^${c}$`, "i")),
      };
    } else {
      matchStage.category = new RegExp(`^${category}$`, "i");
    }
  }

  // Filter out blocked users
  if (blockedUsers.length > 0) {
    matchStage.createdBy = { $nin: blockedUsers };
  }

  // We will collect all major filter groups here to ensure they are ANDed together
  const andConditions = [];

  // File Type Filtering
  if (fileTypes && fileTypes.length > 0) {
    // Escaping regex special characters
    const escapedTypeStrings = fileTypes.map((type) =>
      type.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    );

    // Regexes for uploadAsset URL matching
    const uploadAssetRegexes = escapedTypeStrings.map(
      (t) => new RegExp(t, "i"),
    );

    // Regex for basicParametersText matching
    const typesJoined = escapedTypeStrings.join("|");
    const basicParamRegex = new RegExp(
      `File Format\\s*\\{\\{ANSWER:"[^"]*(?:${typesJoined})[^"]*"\\}\\}`,
      "i",
    );

    andConditions.push({
      $or: [
        { fileType: { $in: fileTypes } },
        { uploadAsset: { $in: uploadAssetRegexes } },
        { basicParametersText: { $regex: basicParamRegex } },
      ],
    });
  }

  // Price Filtering
  if (minPrice !== undefined || maxPrice !== undefined) {
    const priceQuery = {};
    if (minPrice !== undefined) priceQuery.$gte = minPrice;
    if (maxPrice !== undefined) priceQuery.$lte = maxPrice;

    andConditions.push({
      $or: [
        { commercialLicensePrice: priceQuery },
        { personalLicensePrice: priceQuery },
        { extendedCommercialPrice: priceQuery },
        { gameEnginePrice: priceQuery },
        { broadcastFilmPrice: priceQuery },
        { extendedRedistributionPrice: priceQuery },
        { educationPrice: priceQuery },
      ],
    });
  }

  // Search Text Filtering
  if (search) {
    const searchRegex = new RegExp(search, "i");
    andConditions.push({
      $or: [
        { title: searchRegex },
        { description: searchRegex },
        { tags: searchRegex },
      ],
    });
  }

  // Apply AND conditions if any exist
  if (andConditions.length > 0) {
    matchStage.$and = andConditions;
  }

  const pipeline = [{ $match: matchStage }];

  // 2. Prioritization Logic (Joining with User Seller Metrics)
  pipeline.push(
    {
      $lookup: {
        from: "users",
        localField: "createdBy",
        foreignField: "_id",
        as: "sellerInfo",
      },
    },
    { $unwind: { path: "$sellerInfo", preserveNullAndEmptyArrays: true } },
    {
      $addFields: {
        priorityScore: {
          $add: [
            {
              $multiply: [
                { $ifNull: ["$sellerInfo.sellerMetrics.averageRating", 0] },
                10,
              ],
            },
            {
              $multiply: [
                { $ifNull: ["$sellerInfo.sellerMetrics.totalOrders", 0] },
                2,
              ],
            },
            { $ifNull: ["$sellerInfo.sellerMetrics.totalReviews", 0] },
          ],
        },
      },
    },
  );

  // 3. Poly Count Extraction & Filtering (Only if range is specified)
  if (minPoly !== undefined || maxPoly !== undefined) {
    pipeline.push({
      $addFields: {
        polyCountExtracted: {
          $regexFind: {
            input: "$basicParametersText",
            regex: /Polygon Count\s*\{\{ANSWER:"(\d+)"\}\}/i,
          },
        },
      },
    });

    pipeline.push({
      $addFields: {
        polyCountValue: {
          $convert: {
            input: {
              $arrayElemAt: ["$polyCountExtracted.captures", 0],
            },
            to: "int",
            onError: null,
            onNull: null,
          },
        },
      },
    });

    const polyMatch = {};
    if (minPoly !== undefined) polyMatch.$gte = minPoly;
    if (maxPoly !== undefined) polyMatch.$lte = maxPoly;

    pipeline.push({
      $match: {
        polyCountValue: polyMatch,
      },
    });
  }

  // 4. Sort & Limit
  pipeline.push({ $sort: { priorityScore: -1, updatedAt: -1, createdAt: -1 } });

  if (isFilterApplied) {
    pipeline.push({ $limit: TARGET_COUNT });
  }

  console.log("🎵 Zanmolo Aggregation Pipeline Configured, executing...");

  let assets = await ShareMusicAsset.aggregate(pipeline);

  console.log("🎵 Zanmolo Found initial assets:", assets.length);

  // If filter is applied and we have fewer than TARGET_COUNT items, fill the page with other assets
  if (isFilterApplied && assets.length < TARGET_COUNT) {
    const existingIds = assets.map((a) => a._id);
    const needed = TARGET_COUNT - assets.length;

    // Fetch additional assets: not in current set, not blocked
    const fillPipeline = [
      {
        $match: {
          _id: { $nin: existingIds },
          createdBy: { $nin: blockedUsers },
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "createdBy",
          foreignField: "_id",
          as: "sellerInfo",
        },
      },
      { $unwind: { path: "$sellerInfo", preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          priorityScore: {
            $add: [
              {
                $multiply: [
                  { $ifNull: ["$sellerInfo.sellerMetrics.averageRating", 0] },
                  10,
                ],
              },
              {
                $multiply: [
                  { $ifNull: ["$sellerInfo.sellerMetrics.totalOrders", 0] },
                  2,
                ],
              },
              { $ifNull: ["$sellerInfo.sellerMetrics.totalReviews", 0] },
            ],
          },
        },
      },
      { $sort: { priorityScore: -1, updatedAt: -1, createdAt: -1 } },
    ];

    fillPipeline.push({ $limit: needed });
    console.log("🎵 Zanmolo executing fill pipeline query...");

    const additionalAssets = await ShareMusicAsset.aggregate(fillPipeline);

    console.log("🎵 Zanmolo Adding extra assets:", additionalAssets.length);

    let combined = [
      ...interleaveByAuthor(assets),
      ...interleaveByAuthor(additionalAssets),
    ];

    if (combined.length > TARGET_COUNT) {
      combined = combined.slice(0, TARGET_COUNT);
    }
    assets = combined;
  } else {
    assets = interleaveByAuthor(assets);
  }

  // Collect unique userIds from assets for batch fetching userSpace data
  const userIds = [
    ...new Set(assets.map((asset) => asset.createdBy.toString())),
  ];

  // Fetch UserSpace documents for all these users
  const userSpaces = await UserSpace.find({
    createdBy: { $in: userIds },
  }).lean();

  // Create a map for quick lookup
  const userSpaceMap = {};
  userSpaces.forEach((u) => {
    userSpaceMap[u.createdBy] = {
      userName: `${u.firstName || ""} ${u.lastName || ""}`.trim(),
      profilePicture: u.profilePicture || "",
      creationOccupation: u.creationOccupation || [],
    };
  });

  // Format assets with userName and profilePicture from UserSpace
  const formatted = assets.map((obj) => {
    const userInfo = userSpaceMap[obj.createdBy] || {
      userName: "",
      profilePicture: "",
      creationOccupation: [],
    };

    return {
      id: obj._id.toString(),
      // Map database fields to frontend expected fields
      songName: obj.title || "",
      creationOccupation: userInfo.creationOccupation || [],
      musicImage:
        obj.assetImages && obj.assetImages.length > 0 ? obj.assetImages[0] : "",
      commercialUsePrice: obj.commercialLicensePrice || 0,
      personalUsePrice: obj.personalLicensePrice || 0,
      // Additional fields that frontend expects
      musicStyle: obj.category || "",
      musicMood: obj.subcategory || "",
      musicInstrument:
        obj.softwareTools && obj.softwareTools.length > 0
          ? obj.softwareTools.join(", ")
          : "",
      tags: obj.tags || [],
      myRole: ["Producer"], // Default role for music assets
      singerName: userInfo.userName || "",
      composerName: userInfo.userName || "",
      fileSize: obj.fileSize || 0,
      fileType: (() => {
        // If fileType is already set, use it
        if (obj.fileType && obj.fileType.trim()) {
          return obj.fileType;
        }
        // Otherwise, extract from uploadAsset URL for backward compatibility
        if (Array.isArray(obj.uploadAsset) && obj.uploadAsset.length > 0) {
          const exts = obj.uploadAsset
            .map((u) => u.split(".").pop().toLowerCase())
            .filter(Boolean);
          return [...new Set(exts)].join(", ");
        } else if (
          typeof obj.uploadAsset === "string" &&
          obj.uploadAsset.includes(".")
        ) {
          return obj.uploadAsset.split(".").pop().toLowerCase();
        }
        return "";
      })(), // Safe to expose - just the extension
      // Keep original fields for backward compatibility (non-sensitive)
      title: obj.title,
      assetImages: obj.assetImages,
      commercialLicensePrice: obj.commercialLicensePrice,
      personalLicensePrice: obj.personalLicensePrice,
      extendedCommercialPrice: obj.extendedCommercialPrice,
      gameEnginePrice: obj.gameEnginePrice,
      broadcastFilmPrice: obj.broadcastFilmPrice,
      extendedRedistributionPrice: obj.extendedRedistributionPrice,
      educationPrice: obj.educationPrice,
      description: obj.description,
      category: obj.category,
      subcategory: obj.subcategory,
      embeds: obj.embeds,
      additionalInformation: obj.additionalInformation,
      basicParametersText: obj.basicParametersText,
      classificationParametersText: obj.classificationParametersText,
      likes: obj.likes,
      status: obj.status,
      views: obj.views,
      createdBy: obj.createdBy,
      updatedBy: obj.updatedBy,
      comments: obj.comments,
      createdAt: obj.createdAt,
      updatedAt: obj.updatedAt,
      isFree: obj.isFree,
      softwareTools: obj.softwareTools,
      // User info
      userName: userInfo.userName,
      profilePicture: userInfo.profilePicture,
    };
  });

  return formatted;
};

const getMyAssets = async (userId) => {
  // Fetch assets created by userId
  const assets = await ShareMusicAsset.find({ createdBy: userId })
    .limit(30)
    .sort({ createdAt: -1 });

  // Fetch userSpace for this user only
  const userSpace = await UserSpace.findOne({ createdBy: userId }).lean();

  const userName = userSpace
    ? `${userSpace.firstName || ""} ${userSpace.lastName || ""}`.trim()
    : "";
  const profilePicture = (userSpace && userSpace.profilePicture) || "";
  const creationOccupation = userSpace
    ? userSpace.creationOccupation || []
    : [];

  // Format assets with userName and profilePicture from userSpace
  const formatted = assets.map((asset) => {
    const obj = asset.toObject();

    // For maximum security, never expose download URLs in any API response
    // Download access should be handled through a separate secure endpoint

    return {
      id: obj._id.toString(),
      // Map database fields to frontend expected fields
      songName: obj.title || "",
      creationOccupation: creationOccupation,
      musicImage:
        obj.assetImages && obj.assetImages.length > 0 ? obj.assetImages[0] : "",
      commercialUsePrice: obj.commercialLicensePrice || 0,
      personalUsePrice: obj.personalLicensePrice || 0,
      // Additional fields that frontend expects
      musicStyle: obj.category || "",
      musicMood: obj.subcategory || "",
      musicInstrument:
        obj.softwareTools && obj.softwareTools.length > 0
          ? obj.softwareTools.join(", ")
          : "",
      tags: obj.tags || [],
      myRole: ["Producer"], // Default role for music assets
      singerName: userName || "",
      composerName: userName || "",
      fileSize: obj.fileSize || 0,
      fileType: (() => {
        // If fileType is already set, use it
        if (obj.fileType && obj.fileType.trim()) {
          return obj.fileType;
        }
        // Otherwise, extract from uploadAsset URL for backward compatibility
        if (Array.isArray(obj.uploadAsset) && obj.uploadAsset.length > 0) {
          const exts = obj.uploadAsset
            .map((u) => u.split(".").pop().toLowerCase())
            .filter(Boolean);
          return [...new Set(exts)].join(", ");
        } else if (
          typeof obj.uploadAsset === "string" &&
          obj.uploadAsset.includes(".")
        ) {
          return obj.uploadAsset.split(".").pop().toLowerCase();
        }
        return "";
      })(), // Safe to expose - just the extension
      // Keep original fields for backward compatibility (non-sensitive)
      title: obj.title,
      assetImages: obj.assetImages,
      commercialLicensePrice: obj.commercialLicensePrice,
      personalLicensePrice: obj.personalLicensePrice,
      extendedCommercialPrice: obj.extendedCommercialPrice,
      gameEnginePrice: obj.gameEnginePrice,
      broadcastFilmPrice: obj.broadcastFilmPrice,
      extendedRedistributionPrice: obj.extendedRedistributionPrice,
      educationPrice: obj.educationPrice,
      description: obj.description,
      category: obj.category,
      subcategory: obj.subcategory,
      embeds: obj.embeds,
      additionalInformation: obj.additionalInformation,
      basicParametersText: obj.basicParametersText,
      classificationParametersText: obj.classificationParametersText,
      likes: obj.likes,
      status: obj.status,
      views: obj.views,
      createdBy: obj.createdBy,
      updatedBy: obj.updatedBy,
      comments: obj.comments,
      createdAt: obj.createdAt,
      updatedAt: obj.updatedAt,
      isFree: obj.isFree,
      softwareTools: obj.softwareTools,
      // User info
      userName,
      profilePicture,
      // Owner flags
      isOwner: true,
      hasPurchased: false, // Not applicable for own assets
      // NOTE: music, audioSrc, musicAudio, uploadAsset fields completely omitted for maximum security
    };
  });

  return formatted;
};

/**
 * Create a music creation
 * @param {Object} body
 * @returns {Promise<Job>}
 */
const shareCreation = async (body) => {
  // For test accounts (virtual users), randomize post time within last 14 days
  try {
    if (body && body.createdBy) {
      const creator = await User.findById(body.createdBy)
        .select("testAccount")
        .lean();
      if (creator && creator.testAccount) {
        const maxDays = 14;
        const offsetMs = Math.floor(Math.random() * maxDays * 24 * 60 * 60 * 1000);
        const randomCreatedAt = new Date(Date.now() - offsetMs);
        body.createdAt = randomCreatedAt;
        body.updatedAt = randomCreatedAt;
      }
    }
  } catch (_) {
    // If lookup fails, fall back to default timestamps
  }

  return ShareMusicCreation.create(body);
};

/**
 * Get Music Assets by userId
 * @param {string} userId
 * @returns {Promise<User>}
 */
const getCreation = async (createdBy) => {
  // Fetch creations created by the user
  const creations = await ShareMusicCreation.find({ createdBy })
    .limit(30)
    .sort({ createdAt: -1 });

  // Fetch userSpace for this user
  const userSpace = await UserSpace.findOne({ createdBy }).lean();

  const userName = userSpace
    ? `${userSpace.firstName || ""} ${userSpace.lastName || ""}`.trim()
    : "";
  const profilePicture = (userSpace && userSpace.profilePicture) || "";
  const creationOccupation = userSpace
    ? userSpace.creationOccupation || []
    : [];

  // Format creations with user information
  const formatted = creations.map((creation) => {
    const obj = creation.toObject();
    return {
      ...obj,
      id: obj._id.toString(),
      // Map database fields to frontend expected fields
      songName: obj.title || "",
      musicImage:
        obj.workImages && obj.workImages.length > 0 ? obj.workImages[0] : "",
      // Additional fields that frontend expects
      musicStyle: obj.category || "",
      creationOccupation: creationOccupation || "",
      musicMood: obj.subcategory || "",
      musicInstrument:
        obj.softwareTool && obj.softwareTool.length > 0
          ? obj.softwareTool.join(", ")
          : "",
      tags: obj.tags || [],
      myRole: obj.myRole || ["Creator"],
      singerName: userName || "",
      composerName: userName || "",
      // User info
      userName: userName,
      profilePicture: profilePicture,
      // Work type
      workType: obj.workType || "design",
    };
  });

  return formatted;
};

const getCreationById = async (id, currentUserId) => {
  const creation = await ShareMusicCreation.findById(id);
  if (!creation) return null;

  const userSpace = await UserSpace.findOne({
    createdBy: creation.createdBy,
  }).lean();

  const userName = userSpace
    ? `${userSpace.firstName || ""} ${userSpace.lastName || ""}`.trim()
    : "";
  const profilePicture = (userSpace && userSpace.profilePicture) || "";

  let isCollected = false;
  let isFollowing = false;
  if (currentUserId) {
    const user = await User.findById(currentUserId);
    if (user) {
      if (user.collections) {
        isCollected = user.collections.some(
          (colId) => colId.toString() === id.toString(),
        );
      }
      if (user.following) {
        isFollowing = user.following.some(
          (followId) => followId.toString() === creation.createdBy.toString(),
        );
      }
    }
    if (user && user.following) {
      isFollowing = user.following.some(
        (followingId) =>
          followingId.toString() === creation.createdBy.toString(),
      );
    }
  }

  const obj = creation.toObject();
  return {
    id: obj._id.toString(),
    title: obj.title,
    description: obj.description,
    workImages: obj.workImages || [],
    creationOccupation: userSpace ? userSpace.creationOccupation || [] : [],
    assetImages: obj.assetImages || [],
    category: obj.category || "",
    subcategory: obj.subcategory || "",
    tags: obj.tags || [],
    softwareTool: obj.softwareTool || [],
    embeds: obj.embeds || "",
    workType: obj.workType || "design",
    // Map database fields to frontend expected fields
    songName: obj.title || "",
    musicImage:
      obj.workImages && obj.workImages.length > 0 ? obj.workImages[0] : "",
    // Additional fields that frontend expects
    musicStyle: obj.category || "",
    musicMood: obj.subcategory || "",
    musicInstrument:
      obj.softwareTool && obj.softwareTool.length > 0
        ? obj.softwareTool.join(", ")
        : "",
    myRole: obj.myRole || ["Creator"],
    singerName: userName || "",
    composerName: userName || "",
    // User info
    userName: userName,
    profilePicture: profilePicture,
    // Include likes array and calculate totalLikes
    likes: obj.likes || [],
    totalLikes: (obj.likes || []).length,
    // Include comments array with populated profile pictures
    comments: await Promise.all(
      (obj.comments || []).map(async (comment) => {
        const commenter = await User.findById(comment.userId).select(
          "profilePicture",
        );
        return {
          ...comment,
          profilePicture: commenter ? commenter.profilePicture : null,
        };
      }),
    ),
    // Additional metadata
    createdAt: obj.createdAt,
    createdBy: obj.createdBy,
    views: obj.views?.length || 0,
    isLiked: currentUserId
      ? obj?.likes?.some((id) => id.toString() === currentUserId.toString()) ||
        false
      : false,
    isCollected,
    isBookmarked: isCollected,
    isFollowing: isFollowing,
    contributors: obj.contributors || [],
    hiring: userSpace?.hiring || "",
    location: `${userSpace?.address?.split(",")?.[0]}, ${userSpace?.city}`,
  };
};

const getAllCreations = async (
  userId = null,
  category = null,
  page = 1,
  limit = 10,
  search = null,
) => {
  const TARGET_COUNT = 30;
  const mongoose = require("mongoose");
  const { ShareMusicCreation, User, UserSpace } = require("../models");

  const isFilterApplied = !!((category && category !== "All") || search);

  // Build match filter
  let matchFilter = {};
  if (category && category !== "All") {
    matchFilter.category = category;
  }

  if (search) {
    const searchRegex = new RegExp(search, "i");
    matchFilter.$or = [
      { title: searchRegex },
      { description: searchRegex },
      { tags: searchRegex },
    ];
  }

  // Get blockedUsers if userId is provided
  let blockedUsers = [];
  if (userId) {
    const user = await User.findById(userId).select("blockedUsers");
    if (user && Array.isArray(user.blockedUsers)) {
      blockedUsers = user.blockedUsers.map(
        (id) => new mongoose.Types.ObjectId(id),
      );
    }
  }

  if (blockedUsers.length > 0) {
    matchFilter.createdBy = { $nin: blockedUsers };
  }

  const pipeline = [
    { $match: matchFilter },
    // Join with User model to get seller metrics
    {
      $lookup: {
        from: "users",
        let: { creatorId: { $toObjectId: "$createdBy" } },
        pipeline: [
          { $match: { $expr: { $eq: ["$_id", "$$creatorId"] } } },
          { $project: { sellerMetrics: 1 } },
        ],
        as: "sellerInfo",
      },
    },
    { $unwind: { path: "$sellerInfo", preserveNullAndEmptyArrays: true } },
    // Calculate priority score
    {
      $addFields: {
        priorityScore: {
          $add: [
            {
              $multiply: [
                { $ifNull: ["$sellerInfo.sellerMetrics.averageRating", 0] },
                10,
              ],
            },
            {
              $multiply: [
                { $ifNull: ["$sellerInfo.sellerMetrics.totalOrders", 0] },
                2,
              ],
            },
            { $ifNull: ["$sellerInfo.sellerMetrics.totalReviews", 0] },
          ],
        },
      },
    },
    // Sort by priority score, updatedAt, then createdAt
    { $sort: { priorityScore: -1, updatedAt: -1, createdAt: -1 } },
  ];

  if (isFilterApplied) {
    pipeline.push({ $limit: TARGET_COUNT });
  }

  console.log(
    "🎨 getAllCreations Aggregation Pipeline:",
    JSON.stringify(pipeline, null, 2),
  );

  let resultCreations = await ShareMusicCreation.aggregate(pipeline);

  console.log("🎨 Found initial creations:", resultCreations.length);

  // If filter is applied and we have fewer than TARGET_COUNT items, fill the page with other creations
  if (isFilterApplied && resultCreations.length < TARGET_COUNT) {
    const existingIds = resultCreations.map((c) => c._id);
    const needed = TARGET_COUNT - resultCreations.length;

    // Fetch additional creations: not in current set, not blocked, and sorted by date/score
    const fillPipeline = [
      {
        $match: {
          _id: { $nin: existingIds },
          createdBy: { $nin: blockedUsers.map((id) => id.toString()) },
        },
      },
      {
        $lookup: {
          from: "users",
          let: { creatorId: { $toObjectId: "$createdBy" } },
          pipeline: [
            { $match: { $expr: { $eq: ["$_id", "$$creatorId"] } } },
            { $project: { sellerMetrics: 1 } },
          ],
          as: "sellerInfo",
        },
      },
      { $unwind: { path: "$sellerInfo", preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          priorityScore: {
            $add: [
              {
                $multiply: [
                  { $ifNull: ["$sellerInfo.sellerMetrics.averageRating", 0] },
                  10,
                ],
              },
              {
                $multiply: [
                  { $ifNull: ["$sellerInfo.sellerMetrics.totalOrders", 0] },
                  2,
                ],
              },
              { $ifNull: ["$sellerInfo.sellerMetrics.totalReviews", 0] },
            ],
          },
        },
      },
      { $sort: { priorityScore: -1, updatedAt: -1, createdAt: -1 } },
      { $limit: needed },
    ];

    const additionalCreations = await ShareMusicCreation.aggregate(
      fillPipeline,
    );

    console.log("🎨 Adding extra creations:", additionalCreations.length);
    resultCreations = [...resultCreations, ...additionalCreations];
  }

  // Interleave creations by author to avoid same author documents coming next to each other
  resultCreations = interleaveByAuthor(resultCreations);

  // Collect unique userIds from resultCreations for batch fetching userSpace data
  const userIds = [
    ...new Set(resultCreations.map((creation) => creation.createdBy)),
  ];

  // Fetch UserSpace documents for all these users
  const userSpaces = await UserSpace.find({
    createdBy: { $in: userIds },
  }).lean();

  // Create a map for quick lookup
  const userSpaceMap = {};
  userSpaces.forEach((u) => {
    userSpaceMap[u.createdBy] = {
      userName: `${u.firstName || ""} ${u.lastName || ""}`.trim(),
      profilePicture: u.profilePicture || "",
      creationOccupation: u.creationOccupation || [],
      userCountry: (u.address || "").split(",")[0] || "",
    };
  });

  // Format creations with user information
  const formatted = resultCreations.map((creation) => {
    const obj = creation.toObject ? creation.toObject() : creation;
    const userInfo = userSpaceMap[obj.createdBy] || {
      userName: "",
      profilePicture: "",
      creationOccupation: [],
    };

    let isLiked = false;
    if (userId) {
      isLiked = (obj.likes || []).some(
        (id) => id.toString() === userId.toString(),
      );
    }

    return {
      id: obj._id.toString(),
      title: obj.title,
      description: obj.description,
      workImages: obj.workImages || [],
      assetImages: obj.assetImages || [],
      creationOccupation: userInfo.creationOccupation || [],
      category: obj.category || "",
      subcategory: obj.subcategory || "",
      tags: obj.tags || [],
      softwareTool: obj.softwareTool || [],
      embeds: obj.embeds || "",
      workType: obj.workType || "design",
      createdAt: obj.createdAt,
      createdBy: obj.createdBy,
      views: obj.views || 0,
      contributors: obj.contributors || [],
      // Map database fields to frontend expected fields
      songName: obj.title || "",
      musicImage:
        obj.workImages && obj.workImages.length > 0 ? obj.workImages[0] : "",
      // Additional fields that frontend expects
      musicStyle: obj.category || "",
      musicMood: obj.subcategory || "",
      musicInstrument:
        obj.softwareTool && obj.softwareTool.length > 0
          ? obj.softwareTool.join(", ")
          : "",
      myRole: obj.myRole || ["Creator"],
      singerName: userInfo.userName || "",
      composerName: userInfo.userName || "",
      // User info
      userName: userInfo.userName,
      profilePicture: userInfo.profilePicture,
      userCountry: userInfo.userCountry || "",
      isLiked,
      isCreation: true, // Flag to identify this as a creation
      // Include likes array and calculate totalLikes
      likes: obj.likes || [],
      totalLikes: (obj.likes || []).length,
      // Include comments array
      comments: obj.comments || [],
    };
  });

  return formatted;
};

const addToCart = async (userId, assetId) => {
  try {
    let cart = await Cart.findOne({ createdBy: userId });

    if (!cart) {
      cart = new Cart({
        createdBy: userId,
        cartItems: [{ assetId, quantity: 1 }],
      });
    } else {
      const existingItem = cart.cartItems.find(
        (item) => item.assetId.toString() === assetId,
      );

      if (existingItem) {
        existingItem.quantity += 1;
      } else {
        cart.cartItems.push({ assetId, quantity: 1 });
      }
    }

    await cart.save();

    let CartData = await Cart.findById(cart._id).populate({
      path: "cartItems.assetId",
      select:
        "title songName commercialUsePrice musicImage workImages assetImages createdBy",
      populate: {
        path: "createdBy",
        select: "name _id",
      },
    });

    const data = CartData.cartItems.map((item) => ({
      ...item.toObject(),
      assetId: {
        ...item.assetId.toObject(),
        creatorName:
          (item.assetId.createdBy && item.assetId.createdBy.name) || "Unknown",
        ownerId:
          item.assetId.createdBy &&
          (item.assetId.createdBy._id || item.assetId.createdBy.id),
      },
    }));

    // console.log(data, 'data')

    return data;
  } catch (error) {
    console.error("Error adding to cart:", error);
    throw new Error("Could not add asset to cart");
  }
};

const getCart = async (userId) => {
  try {
    const cart = await Cart.findOne({ createdBy: userId });

    if (!cart) {
      return { success: false, message: "Cart is empty", cart: [] };
    }

    let CartData = await Cart.findById(cart._id).populate({
      path: "cartItems.assetId",
      select:
        "title songName commercialUsePrice musicImage workImages assetImages createdBy",
      populate: {
        path: "createdBy",
        select: "name _id",
      },
    });

    const data = CartData.cartItems.map((item) => ({
      ...item.toObject(),
      assetId: {
        ...item.assetId.toObject(),
        creatorName:
          (item.assetId.createdBy && item.assetId.createdBy.name) || "Unknown",
        ownerId:
          item.assetId.createdBy &&
          (item.assetId.createdBy._id || item.assetId.createdBy.id),
      },
    }));

    return data;
  } catch (error) {
    console.error("Error fetching cart:", error);
    throw new Error("Could not retrieve cart");
  }
};

const deleteCart = async (userId, assetId) => {
  try {
    const cart = await Cart.findOne({ createdBy: userId });

    if (!cart) {
      return { success: false, message: "Cart not found" };
    }

    // Remove the specific item from cartItems array
    cart.cartItems = cart.cartItems.filter(
      (item) => item.assetId.toString() !== assetId,
    );

    // Save the updated cart
    await cart.save();

    return {
      success: true,
      message: "Item removed from cart successfully",
      updatedCart: cart,
    };
  } catch (error) {
    console.error("Error removing item from cart:", error);
    throw new Error("Could not remove item from cart");
  }
};

const addSale = async (saleData, userId) => {
  try {
    const { Purchase, User } = require("../models");
    const { calculateSellerPayout } = require("../utils/vatCalculator");

    const sale = await Sale.create({
      assetId: new mongoose.Types.ObjectId(saleData.assetId),
      OwnerId: new mongoose.Types.ObjectId(saleData.OwnerId),
      buyerId: new mongoose.Types.ObjectId(userId), // Add buyer ID for proper tracking
      assetPrice: saleData.assetPrice,
      buyer: saleData.buyer,
      assetTitle: saleData.assetTitle,
      quantity: saleData.quantity,
      totalAmount: saleData.assetPrice * saleData.quantity, // Calculate total amount
      creatorName: saleData.creatorName,
      status: "completed", // Set default status
      paymentMethod: saleData.paymentMethod || "paypal",
      paymentId: saleData.paymentId,
    });

    await sale.save();

    if (!sale) {
      return { success: false, message: "Sale not created" };
    }

    // Calculate seller payout with new fee structure: 60% - 2.9% Stripe fee - 1.33% VAT
    const sellingPrice = saleData.assetPrice * saleData.quantity;
    const sellerPayoutBreakdown = calculateSellerPayout(sellingPrice);

    // Update seller balance with new payout structure
    try {
      const seller = await User.findById(saleData.OwnerId);

      if (seller) {
        const netSellerPayout = sellerPayoutBreakdown.netSellerPayout;

        await User.findByIdAndUpdate(saleData.OwnerId, {
          $inc: { balance: netSellerPayout },
        });

        console.log(
          `✅ MUSIC SALE: Added $${netSellerPayout.toFixed(2)} to seller ${
            seller.email || seller.name
          }`,
        );
      } else {
        console.error("❌ Seller not found for ID:", saleData.OwnerId);
      }
    } catch (balanceError) {
      console.error("❌ Error updating seller balance:", balanceError);
      // Don't fail the sale if balance update fails, but log the error
    }

    // Also create a Purchase record for the profile purchases page
    try {
      const purchase = await Purchase.create({
        user: userId,
        music: saleData.assetId,
        amount: saleData.assetPrice * saleData.quantity,
        currency: "USD",
        paymentMethod: saleData.paymentMethod || "stripe",
        licenseType: "Commercial Use",
        status: "completed",
        transactionId: `${saleData.paymentId}_${
          saleData.assetId
        }_${Date.now()}`, // Make unique for each item
        metadata: {
          source: "cart_checkout",
          originalSaleId: sale._id,
          stripePaymentIntentId: saleData.paymentId, // Store original payment intent ID
        },
      });
      console.log("Purchase record created:", purchase._id);
    } catch (purchaseError) {
      console.log("Error creating purchase record:", purchaseError);
      // Don't fail the sale if purchase record creation fails
    }

    // Clear the cart after successful sale
    try {
      const cart = await Cart.findOne({ createdBy: userId });
      if (cart) {
        cart.cartItems = [];
        await cart.save();
        console.log("Cart cleared successfully");
      }
    } catch (cartError) {
      console.log("Error clearing cart:", cartError);
      // Don't fail the sale if cart clearing fails
    }

    // Send Notifications
    try {
      // Fetch asset details to get the correct title
      const asset = await ShareMusicAsset.findById(saleData.assetId);
      const assetTitle = asset ? asset.title : "Music Asset";

      // 1. Notify Buyer (Purchase Successful)
      await notificationService.createNotification(
        "music_purchase",
        userId, // Receiver: Buyer
        saleData.OwnerId, // Sender: Seller
        `You successfully purchased "${assetTitle}"`,
        {
          saleId: sale._id,
          assetId: saleData.assetId,
          amount: saleData.assetPrice * saleData.quantity,
        },
      );

      // 2. Notify Seller (New Sale)
      await notificationService.createNotification(
        "music_sale",
        saleData.OwnerId, // Receiver: Seller
        userId, // Sender: Buyer
        `You made a sale! "${assetTitle}" was purchased.`,
        {
          saleId: sale._id,
          assetId: saleData.assetId,
          amount: sellingPrice, // Use calculated selling price
          payout: sellerPayoutBreakdown.netSellerPayout,
        },
      );
    } catch (notifError) {
      console.error("Failed to send music sale notifications:", notifError);
      // Don't fail the transaction, just log error
    }

    return { success: true, sales: [sale] };
  } catch (error) {
    console.log("Error in addSale:", error);
    return { success: false, message: error.message, error: error };
  }
};

const getSales = async (userId) => {
  try {
    const sales = await Sale.find({ OwnerId: userId });

    if (!sales || sales.length == 0) {
      return { success: false, message: "No sales found" };
    }

    return { success: true, sales };
  } catch (error) {
    console.error("Error fetching sales:", error);
    throw new Error("Could not fetch sales");
  }
};

const getPurchases = async (userId) => {
  try {
    const sales = await Sale.find({ buyerId: userId })
      .populate({
        path: "assetId",
        select:
          "songName musicImage music personalUsePrice commercialUsePrice myRole musicUsage musicStyle",
      })
      .populate({
        path: "OwnerId",
        select: "name email",
      })
      .sort({ createdAt: -1 });

    if (!sales || sales.length == 0) {
      return { success: false, message: "No purchases found" };
    }

    return { success: true, purchases: sales };
  } catch (error) {
    console.error("Error fetching purchases:", error);
    throw new Error("Could not fetch purchases");
  }
};

module.exports = {
  shareAsset,
  updateAsset,
  getAssets,
  getAssetsById,
  shareCreation,
  getCreation,
  getCreationById,
  getAllCreations,
  addToCart,
  getCart,
  deleteCart,
  addSale,
  getSales,
  getAllAssets,
  getPurchases,
  getMyAssets,
};
