const mongoose = require("mongoose");
const config = require("../src/config/config");
const { User } = require("../src/models");
const logger = require("../src/config/logger");

/**
 * Script to clean up names of test accounts.
 * - Capitalizes the first letter.
 * - Removes any digits at the end of the name.
 *
 * Usage:
 *   node scripts/cleanTestUserNames.js [--dry-run]
 */

const cleanTestUserNames = async () => {
  const dryRun = process.argv.includes("--dry-run");

  try {
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    logger.info(`Connected to MongoDB ${dryRun ? "(DRY RUN)" : ""}`);

    const testUsers = await User.find({ testAccount: true });
    logger.info(`Found ${testUsers.length} test accounts.`);

    for (const user of testUsers) {
      const originalName = user.name;
      if (!originalName) continue;

      // 1. Remove digits at the end
      let cleanedName = originalName.replace(/\d+$/, "");

      // 2. Trim whitespace
      cleanedName = cleanedName.trim();

      // 3. Capitalize first letter of each word (more robust than just first char)
      cleanedName = cleanedName
        .split(" ")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");

      if (cleanedName !== originalName) {
        if (dryRun) {
          logger.info(
            `[DRY RUN] Would update "${originalName}" -> "${cleanedName}"`,
          );
        } else {
          user.name = cleanedName;
          await user.save();
          logger.info(`Updated "${originalName}" -> "${cleanedName}"`);
        }
      }
    }

    logger.info(
      `Name cleanup ${dryRun ? "simulation" : "execution"} completed.`,
    );
    process.exit(0);
  } catch (error) {
    logger.error("Error cleaning test user names:", error);
    process.exit(1);
  }
};

cleanTestUserNames();
