const mongoose = require("mongoose");
const Music = require("../models/music.model");
const LyricsMusic = require("../models/lyrics.model");
const ShareMusicAsset = require("../models/shareMusicAsset.model");
const ShareMusicCreation = require("../models/shareMusicCreation.model");
const Gig = require("../models/gig.model");

/**
 * Calculate total likes/favorites for a user across all work types.
 * Uses correct createdBy/seller types per model:
 * - Music, LyricsMusic, ShareMusicCreation: createdBy is String
 * - ShareMusicAsset: createdBy is ObjectId
 * - Gig: seller is ObjectId, uses "favorites" not "likes"
 * @param {string|mongoose.Types.ObjectId} userId - User id (string or ObjectId)
 * @returns {Promise<number>} Total count of likes + gig favorites
 */
const calculateTotalLikes = async (userId) => {
  const userIdStr =
    typeof userId === "string" ? userId : userId?.toString?.() || "";
  let userIdObj = null;
  if (userId instanceof mongoose.Types.ObjectId) {
    userIdObj = userId;
  } else if (userIdStr && mongoose.Types.ObjectId.isValid(userIdStr)) {
    try {
      userIdObj = new mongoose.Types.ObjectId(userIdStr);
    } catch (_) {
      // ignore invalid id
    }
  }

  const [musicLikes, lyricsLikes, creationLikes, assetLikes, gigFavorites] =
    await Promise.all([
      // createdBy is String
      Music.aggregate([
        { $match: { createdBy: userIdStr } },
        { $project: { likesCount: { $size: { $ifNull: ["$likes", []] } } } },
        { $group: { _id: null, total: { $sum: "$likesCount" } } },
      ]),
      LyricsMusic.aggregate([
        { $match: { createdBy: userIdStr } },
        { $project: { likesCount: { $size: { $ifNull: ["$likes", []] } } } },
        { $group: { _id: null, total: { $sum: "$likesCount" } } },
      ]),
      ShareMusicCreation.aggregate([
        { $match: { createdBy: userIdStr } },
        { $project: { likesCount: { $size: { $ifNull: ["$likes", []] } } } },
        { $group: { _id: null, total: { $sum: "$likesCount" } } },
      ]),
      // createdBy is ObjectId
      userIdObj
        ? ShareMusicAsset.aggregate([
            { $match: { createdBy: userIdObj } },
            {
              $project: { likesCount: { $size: { $ifNull: ["$likes", []] } } },
            },
            { $group: { _id: null, total: { $sum: "$likesCount" } } },
          ])
        : [],
      // Gig: seller is ObjectId, field is "favorites"
      userIdObj
        ? Gig.aggregate([
            { $match: { seller: userIdObj } },
            {
              $project: {
                favCount: { $size: { $ifNull: ["$favorites", []] } },
              },
            },
            { $group: { _id: null, total: { $sum: "$favCount" } } },
          ])
        : [],
    ]);

  let total = 0;
  if (musicLikes.length > 0) total += musicLikes[0].total;
  if (lyricsLikes.length > 0) total += lyricsLikes[0].total;
  if (creationLikes.length > 0) total += creationLikes[0].total;
  if (assetLikes.length > 0) total += assetLikes[0].total;
  if (gigFavorites.length > 0) total += gigFavorites[0].total;

  return total;
};

module.exports = {
  calculateTotalLikes,
};
