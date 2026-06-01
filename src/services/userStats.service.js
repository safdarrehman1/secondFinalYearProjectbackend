const mongoose = require("mongoose");
const Job = require("../models/job.model");
const Gig = require("../models/gig.model");

/**
 * Calculate total likes/favorites for a user across jobs and gigs.
 * - Job: createdBy is String
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

  const [jobLikes, gigFavorites] = await Promise.all([
    Job.aggregate([
      { $match: { createdBy: userIdStr } },
      { $project: { likesCount: { $size: { $ifNull: ["$likes", []] } } } },
      { $group: { _id: null, total: { $sum: "$likesCount" } } },
    ]),
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
  if (jobLikes.length > 0) total += jobLikes[0].total;
  if (gigFavorites.length > 0) total += gigFavorites[0].total;

  return total;
};

module.exports = {
  calculateTotalLikes,
};
