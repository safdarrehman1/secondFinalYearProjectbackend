const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
const config = require("../src/config/config");
const { User, ShareMusicCreation } = require("../src/models");
const logger = require("../src/config/logger");

const generateHardcodedStats = async () => {
  try {
    console.log(config.mongoose)
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    logger.info("Connected to MongoDB for generating hardcoded stats");

    const testUsers = await User.find({ testAccount: true });
    logger.info(`Found ${testUsers.length} test accounts.`);

    const stats = {};

    for (const user of testUsers) {
      // Fetch all creations by this user
      const creations = await ShareMusicCreation.find({ createdBy: user._id });

      // Sum the likes across all creations
      const totalLikes = creations.reduce((sum, item) => {
        return sum + (Array.isArray(item.likes) ? item.likes.length : 0);
      }, 0);

      // Random followers between 10 and 100 for variety
      const followers = Math.floor(Math.random() * (100 - 10 + 1)) + 10;

      stats[user._id.toString()] = {
        totalLikes,
        followers,
      };
    }

    const configDir = path.join(__dirname, "../src/config");
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    const filePath = path.join(configDir, "hardcodedStats.json");
    fs.writeFileSync(filePath, JSON.stringify(stats, null, 2));

    logger.info(
      `Successfully generated hardcoded stats for ${testUsers.length} users and saved to ${filePath}`,
    );
    process.exit(0);
  } catch (error) {
    logger.error("Error generating hardcoded stats:", error);
    process.exit(1);
  }
};

generateHardcodedStats();
