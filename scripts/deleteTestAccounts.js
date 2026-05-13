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

const deleteTestAccounts = async () => {
  try {
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    logger.info("Connected to MongoDB for deleting test accounts");

    const result = await User.deleteMany({ email: { $in: testAccounts } });

    logger.info(`Deleted ${result.deletedCount} test accounts.`);

    process.exit(0);
  } catch (error) {
    logger.error("Error deleting test accounts:", error);
    process.exit(1);
  }
};

deleteTestAccounts();
