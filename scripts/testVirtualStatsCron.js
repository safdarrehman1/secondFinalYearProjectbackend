const mongoose = require("mongoose");
const config = require("../src/config/config");
const { virtualStatsService } = require("../src/services");
const { ShareMusicCreation } = require("../src/models");
const logger = require("../src/config/logger");

const testVirtualStats = async () => {
  try {
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    logger.info("Connected to MongoDB for testing.");

    // Pick one document to check
    const beforeWork = await ShareMusicCreation.findOne({});
    if (!beforeWork) {
      logger.error("No documents found in ShareMusicCreation.");
      process.exit(1);
    }

    const beforeLikes = beforeWork.likes.length;
    const beforeViews = beforeWork.views.length;

    logger.info(`Testing virtualStatsService.incrementVirtualStats()...`);
    await virtualStatsService.incrementVirtualStats();

    const afterWork = await ShareMusicCreation.findById(beforeWork._id);
    const afterLikes = afterWork.likes.length;
    const afterViews = afterWork.views.length;

    logger.info(`Stats for "${beforeWork.title}":`);
    logger.info(`Likes: ${beforeLikes} -> ${afterLikes} (Diff: ${afterLikes - beforeLikes})`);
    logger.info(`Views: ${beforeViews} -> ${afterViews} (Diff: ${afterViews - beforeViews})`);

    if (afterLikes > beforeLikes && afterViews > beforeViews) {
      logger.info("VERIFICATION SUCCESSFUL: Stats incremented.");
    } else {
      logger.error("VERIFICATION FAILED: Stats did not increment as expected.");
    }

    process.exit(0);
  } catch (error) {
    logger.error("Error in test script:", error);
    process.exit(1);
  }
};

testVirtualStats();
