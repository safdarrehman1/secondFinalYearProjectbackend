const mongoose = require("mongoose");
const config = require("../src/config/config");
const { User } = require("../src/models");
const logger = require("../src/config/logger");

const testAccounts = [
  "ateliernordform0321@test.com",
  "studioveridian0321@test.com",
  "bianchiforme0321@test.com",
  "lumenatelier0321@test.com",
  "horizongridarchitects0321@test.com",
  "axisfoundry0321@test.com",
  "prairieconstructlab0321@test.com",
  "terraformastudio0321@test.com",
  "kurohanaarchitects0321@test.com",
  "shizenspatiallab0321@test.com",
  "tropicaxis0321@test.com",
  "nusantaradesign0321@test.com",
  "bamboogrid0321@test.com",
  "urbanreef0321@test.com",
  "duneform0321@test.com",
  "cedaraxis0321@test.com",
  "atlasurban0321@test.com",
  "petraform0321@test.com",
  "oasisstructure0321@test.com",
  "levantmodern0321@test.com",
];

const password = "Test123456#";

const seedTestAccounts = async () => {
  try {
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    logger.info("Connected to MongoDB for seeding test accounts");

    for (const email of testAccounts) {
      const existingUser = await User.findOne({ email });

      if (existingUser) {
        logger.info(
          `User ${email} already exists. Updating testAccount field.`,
        );
        existingUser.testAccount = true;
        await existingUser.save();
      } else {
        logger.info(`Creating user ${email}`);
        // Only set essential fields, others will use defaults
        // Name will be derived from email (part before @)
        const name = email.split("@")[0];

        await User.create({
          name,
          email,
          password,
          testAccount: true,
          isEmailVerified: true, // Assuming test accounts should be verified
          role: "user",
        });
      }
    }

    logger.info("Test accounts seeding completed successfully");
    process.exit(0);
  } catch (error) {
    logger.error("Error seeding test accounts:", error);
    process.exit(1);
  }
};

seedTestAccounts();
