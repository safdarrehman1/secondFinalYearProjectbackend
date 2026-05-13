const mongoose = require("mongoose");
const config = require("../src/config/config");
const { ShareMusicCreation } = require("../src/models");
const logger = require("../src/config/logger");

/**
 * Script to add virtual views and likes to ShareMusicCreation documents.
 *
 * Usage:
 *   node scripts/addVirtualStats.js [--dry-run]
 *
 * Flags:
 *   --dry-run: Simulates the process without updating the database.
 */

const addVirtualStats = async () => {
  const dryRun = process.argv.includes("--dry-run");

  try {
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    logger.info(`Connected to MongoDB ${dryRun ? "(DRY RUN)" : ""}`);

    const works = await ShareMusicCreation.find({});
    logger.info(`Found ${works.length} documents to update.`);

    for (const work of works) {
      const numViews = Math.floor(Math.random() * (100 - 10 + 1)) + 10;
      const numLikes = Math.floor(Math.random() * (50 - 5 + 1)) + 5;

      const newViews = Array.from(
        { length: numViews },
        () => new mongoose.Types.ObjectId(),
      );
      const newLikes = Array.from(
        { length: numLikes },
        () => new mongoose.Types.ObjectId(),
      );

      if (dryRun) {
        logger.info(
          `[DRY RUN] Would add ${numViews} views and ${numLikes} likes to "${work.title}" (ID: ${work._id})`,
        );
      } else {
        await ShareMusicCreation.updateOne(
          { _id: work._id },
          {
            $push: {
              views: { $each: newViews },
              likes: { $each: newLikes },
            },
          },
        );
        logger.info(
          `Updated "${work.title}" (ID: ${work._id}) with ${numViews} views and ${numLikes} likes.`,
        );
      }
    }

    logger.info(
      `Virtual stats ${
        dryRun ? "simulation" : "update"
      } completed successfully.`,
    );
    process.exit(0);
  } catch (error) {
    logger.error("Error adding virtual stats:", error);
    process.exit(1);
  }
};

addVirtualStats();
