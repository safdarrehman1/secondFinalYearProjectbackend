const httpStatus = require("http-status");
const catchAsync = require("../utils/catchAsync");
const ApiError = require("../utils/ApiError");
const { userSpaceService, userStatsService } = require("../services");
const fs = require("fs");
const Music = require("../models/music.model");
const LyricsMusic = require("../models/lyrics.model");
const ShareMusicAsset = require("../models/shareMusicAsset.model");
const ShareMusicCreation = require("../models/shareMusicCreation.model");
const User = require("../models/user.model");
const uploadCover = require("./uploadCover.controller");
const RatingService = require("../services/rating.service");
const {
  validateProfessionFields,
  syncProfessionToUserModel,
} = require("../utils/professionValidator");

const addSpace = catchAsync(async (req, res) => {
  // Validate profession fields
  const professionValidation = validateProfessionFields(
    req.body.creationOccupation,
    req.body.businessOccupation,
    req.body.isClient,
  );

  if (!professionValidation.isValid) {
    throw new ApiError(httpStatus.BAD_REQUEST, professionValidation.message);
  }

  const payload = {
    ...req.body,
    creationOccupation:
      professionValidation.creationOccupation ||
      req.body.creationOccupation ||
      [],
    businessOccupation:
      professionValidation.businessOccupation ||
      req.body.businessOccupation ||
      "",
    createdBy: req.user.id,
    updatedBy: req.user.id,
  };
  const existUserSpace = await userSpaceService.getSpace(req.user.id);

  let userSpace;
  if (existUserSpace) {
    // If space exists, update it instead of throwing error
    userSpace = await userSpaceService.updateSpace(req.user.id, payload);
  } else {
    // Create new space
    userSpace = await userSpaceService.addSpace(payload);
  }

  // Sync profession data to User model
  const professionMetadata = syncProfessionToUserModel(req.user.id, userSpace);

  await User.findByIdAndUpdate(
    req.user.id,
    {
      name: `${userSpace.firstName || ""} ${userSpace.lastName || ""}`.trim(),
      profilePicture: userSpace.profilePicture || "",
      ...professionMetadata,
    },
    { new: true },
  );
  /** taging file for specific userSpaceId */
  if (userSpace) {
    try {
      const directory = `./public/uploads/${req.user.id}`;
      // Check if directory exists before reading
      if (fs.existsSync(directory)) {
        fs.readdirSync(directory).forEach(async (file) => {
          let extFile = file.split(".").pop();
          let currentFilename = file.split(".").shift();
          if (req.body.profilePicture == currentFilename) {
            fs.rename(
              `${directory}/${file}`,
              `${directory}/${currentFilename}-${userSpace.id}.${extFile}`,
              (err) => {
                if (err) console.log("Error Rename file", err);
              },
            );

            const updateImage = {
              profilePicture: `${currentFilename}-${userSpace.id}.${extFile}`,
            };
            await userSpaceService.updateSpace(req.user.id, updateImage);
          }
        });
      }
      userSpace.profilePicture = `profilePicture-${userSpace.id}`;
    } catch (error) {
      // Handle the ENOENT error
      if (error.code === "ENOENT") {
        console.error(`Directory not found: ${error.message}`);
        // You can also respond with an appropriate error message if this is an API
        // return res.status(404).json({ message: 'Directory not found.' });
      } else {
        console.log("sini");
        // Handle other types of errors
        console.error("An error occurred:", error.message);
      }
    }
  }

  res
    .status(existUserSpace ? httpStatus.OK : httpStatus.CREATED)
    .send(userSpace);
});

const getSpace = catchAsync(async (req, res) => {
  let result = await userSpaceService.getSpace(req.user.id);
  if (!result) {
    // Jika userSpace tidak ada, tampilkan profilePicture dari user
    const user = await User.findById(req.user.id).select("profilePicture");
    return res.send({
      profilePicture: user && user.profilePicture ? user.profilePicture : null,
    });
  }
  result = result && result.toObject ? result.toObject() : result;

  // Same source of truth as profile: userStatsService (Music, Lyrics, ShareMusicCreation string createdBy; ShareMusicAsset, Gig ObjectId)
  const userId = req.user.id;
  result.totalLikes = await userStatsService.calculateTotalLikes(userId);

  // Optimize totalCollect calculation
  // First get all asset IDs created by the user (only IDs, lean query)
  const [musicIds, lyricsIds, shareAssetsIds] = await Promise.all([
    Music.find({ createdBy: userId }).distinct("_id"),
    LyricsMusic.find({ createdBy: userId }).distinct("_id"),
    ShareMusicAsset.find({ createdBy: userId }).distinct("_id"),
  ]);

  const allWorkIds = [...musicIds, ...lyricsIds, ...shareAssetsIds].map((id) =>
    id.toString(),
  ); // Ensure they are strings for comparison if mixed types exist

  // Use MongoDB countDocuments with $in operator instead of fetching all users
  // This is heavily optimized compared to iterating users in JS
  let totalCollect = 0;
  if (allWorkIds.length > 0) {
    // NOTE: User.collections can be Mixed type, storing ObjectIds as strings or ObjectIds
    // We check for both strictly if possible, or reliance on $in finding them
    // Since previous code used .toString(), we assume they might be stored variously
    // A simple $in query on the 'collections' array field works efficiently if indexed
    totalCollect = await User.countDocuments({
      collections: { $in: allWorkIds },
    });
  }

  result.country = result.address ? result.address.split(",")[0] : "";
  result.totalCollect = totalCollect;

  // Followers: real count + virtual (1–2 added per user per day by cron)
  const [followersCount, userDoc] = await Promise.all([
    User.countDocuments({ following: userId }),
    User.findById(userId).select("virtualFollowers").lean(),
  ]);
  const virtualFollowers = (userDoc && userDoc.virtualFollowers) || 0;
  result.followers = followersCount + virtualFollowers;

  // Calculate order metrics using RatingService
  const Order = require("../models/order.model");
  const Gig = require("../models/gig.model");

  // Use RatingService to get comprehensive user ratings
  const userRatings = await RatingService.getUserRatings(req.user.id);

  if (userRatings) {
    // Seller metrics
    result.orderQuantity = userRatings.seller.totalReviews; // Seller reviews received
    result.sellerReviews = userRatings.seller.totalReviews; // Also set as sellerReviews for clarity
    result.orderRating = userRatings.seller.averageRating; // Average seller rating
    result.sellerTotalOrders = userRatings.seller.totalOrders; // Total orders as seller

    // Buyer metrics
    result.buyerQuantity = userRatings.buyer.totalOrders; // Buyer orders placed
    result.buyerRating = userRatings.buyer.averageRating; // Average buyer rating
  } else {
    // Fallback to old calculation if RatingService fails
    const userGigs = await Gig.find({ seller: req.user.id });
    const totalReviews = userGigs.reduce(
      (sum, gig) => sum + (gig.totalReviews || 0),
      0,
    );
    result.orderQuantity = totalReviews;
    result.sellerReviews = totalReviews;

    const gigRatings = userGigs
      .filter((gig) => gig.averageRating && gig.averageRating > 0)
      .map((gig) => gig.averageRating);
    result.orderRating =
      gigRatings.length > 0
        ? gigRatings.reduce((sum, rating) => sum + rating, 0) /
          gigRatings.length
        : 0;

    const buyerOrders = await Order.find({
      recruiterId: req.user.id,
      status: "complete",
    });
    result.buyerQuantity = buyerOrders.length;

    const buyerRatings = buyerOrders
      .filter((order) => order.buyerRating && order.buyerRating > 0)
      .map((order) => order.buyerRating);
    result.buyerRating =
      buyerRatings.length > 0
        ? buyerRatings.reduce((sum, rating) => sum + rating, 0) /
          buyerRatings.length
        : 0;
  }

  res.send(result);
});

const updateSpace = catchAsync(async (req, res) => {
  // Validate profession fields if they're being updated
  if (
    req.body.creationOccupation !== undefined ||
    req.body.businessOccupation !== undefined
  ) {
    const professionValidation = validateProfessionFields(
      req.body.creationOccupation,
      req.body.businessOccupation,
      req.body.isClient,
    );

    if (!professionValidation.isValid) {
      throw new ApiError(httpStatus.BAD_REQUEST, professionValidation.message);
    }

    // Update with validated profession fields
    req.body.creationOccupation = professionValidation.creationOccupation;
    req.body.businessOccupation = professionValidation.businessOccupation;
  }

  const payload = {
    ...req.body,
    updatedBy: req.user.id,
  };
  const userSpace = await userSpaceService.updateSpace(req.user.id, payload);

  // Sync profession data to User model after update
  const professionMetadata = syncProfessionToUserModel(req.user.id, userSpace);

  // update user.userName if firstName or lastName changed
  if (payload.firstName || payload.lastName) {
    const name = `${payload.firstName || userSpace.firstName} ${
      payload.lastName || userSpace.lastName
    }`.trim();
    await User.findByIdAndUpdate(
      req.user.id,
      { name, ...professionMetadata },
      { new: true },
    );
  } else {
    // Still sync profession metadata even if name isn't being updated
    await User.findByIdAndUpdate(req.user.id, professionMetadata, {
      new: true,
    });
  }

  // update profilePicture if changed
  if (payload.profilePicture) {
    await User.findByIdAndUpdate(
      req.user.id,
      { profilePicture: payload.profilePicture },
      { new: true },
    );
  }
  res.send(userSpace);
});

const updatePicture = catchAsync(async (req, res) => {
  res.status(httpStatus.CREATED).send();
});

const getUnreadChats = catchAsync(async (req, res) => {
  const Chat = require("../models/chat.model");
  const userId = (req.user._id || req.user.id).toString();
  // Cari chat di mana user adalah participant dan userId belum ada di isRead
  const unreadChats = await Chat.find({
    participants: userId,
    isRead: { $ne: userId },
  });
  res.send({ totalUnreadChats: unreadChats.length });
});

module.exports = {
  getSpace,
  addSpace,
  // editSpace,
  updateSpace,
  updatePicture,
  uploadCover,
  getUnreadChats,
};
