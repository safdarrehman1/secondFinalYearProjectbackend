const mongoose = require("mongoose");
const { ShareMusicCreation, User } = require("../models");
const logger = require("../config/logger");

/**
 * Each user gains 1 or 2 virtual followers per day. Only the virtual count is increased;
 * we never touch User.following or any real follower data. Display = real + virtualFollowers.
 */
const incrementVirtualFollowers = async () => {
  try {
    const users = await User.find({}).select("_id").lean();
    let updated = 0;
    for (const u of users) {
      const add = Math.floor(Math.random() * 2) + 1; // 1 or 2
      // Only $inc virtualFollowers; never modify following[] or real follower count
      await User.updateOne({ _id: u._id }, { $inc: { virtualFollowers: add } });
      updated += 1;
    }
    logger.info(`Cron: Virtual followers incremented for ${updated} users.`);
  } catch (error) {
    logger.error("Cron Error (Virtual Followers):", error);
    throw error;
  }
};

/**
 * Increments virtual likes and views for all ShareMusicCreation documents.
 * Likes: 1-5 random increment
 * Views: 15-40 random increment
 */
const incrementVirtualStats = async () => {
  try {
    const works = await ShareMusicCreation.find({});
    logger.info(`Cron: Found ${works.length} documents to update virtual stats.`);

    for (const work of works) {
      const numViews = Math.floor(Math.random() * (40 - 15 + 1)) + 15;
      const numLikes = Math.floor(Math.random() * (5 - 1 + 1)) + 1;

      const newViews = Array.from(
        { length: numViews },
        () => new mongoose.Types.ObjectId(),
      );
      const newLikes = Array.from(
        { length: numLikes },
        () => new mongoose.Types.ObjectId(),
      );

      await ShareMusicCreation.updateOne(
        { _id: work._id },
        {
          $push: {
            views: { $each: newViews },
            likes: { $each: newLikes },
          },
        },
      );
    }

    logger.info(`Cron: Virtual stats daily update completed for ${works.length} documents.`);

    // Each user gains 1 or 2 virtual followers per day (DB only; no file changes)
    await incrementVirtualFollowers();

    logger.info("Cron: Virtual stats run complete (DB only).");
  } catch (error) {
    logger.error("Cron Error (Virtual Stats):", error);
    throw error;
  }
};

module.exports = {
  incrementVirtualStats,
  incrementVirtualFollowers,
};
