const mongoose = require("mongoose");
const config = require("../src/config/config");
const { User } = require("../src/models");
const logger = require("../src/config/logger");

/**
 * Script to mark specific email addresses as test accounts.
 *
 * Usage:
 *   node scripts/markTestAccounts.js [--dry-run]
 */

const TEST_EMAILS = [
  "lucasmeyer01@test.com",
  "ethancollins02@test.com",
  "hiroshitanaka03@test.com",
  "marcobianchi04@test.com",
  "alexeimorozov05@test.com",
  "julienmoreau06@test.com",
  "danielwright07@test.com",
  "carlosalvarez08@test.com",
  "mateuszkowalski09@test.com",
  "andreasnilsson10@test.com",
  "leonardocosta11@test.com",
  "miguelsantos12@test.com",
  "noahbennett13@test.com",
  "olivergrant14@test.com",
  "arjunmehta15@test.com",
  "youssefelamir16@test.com",
  "chenwei17@test.com",
  "liangjun18@test.com",
  "parkminjae19@test.com",
  "nguyenthanhan20@test.com",
  "ivanpetrov21@test.com",
  "tomaszzielinski22@test.com",
  "omarhaddad23@test.com",
  "nikolaijensen24@test.com",
  "sebastiankruger25@test.com",
  "rafaelortega26@test.com",
  "alirezaei27@test.com",
  "samuelosei28@test.com",
  "davidrosen29@test.com",
  "mareknovak30@test.com",
  "felipeduarte31@test.com",
  "georgepapadopoulos32@test.com",
  "victorionescu33@test.com",
  "abdulrahman34@test.com",
  "faridkhan35@test.com",
  "mohamedzayed36@test.com",
  "jaspervandijk37@test.com",
  "thomaskeller38@test.com",
  "enriquemorales39@test.com",
  "brunoleclerc40@test.com",
  "sergioromano41@test.com",
  "pedronunes42@test.com",
  "zoltanfarkas43@test.com",
  "jakubmalinowski44@test.com",
  "antonkuznetsov45@test.com",
  "ryanoconnor46@test.com",
  "ahmedsaleh47@test.com",
  "benjaminclarke48@test.com",
  "sitiaisyah49@test.com",
  "khaledmansour50@test.com",
];

const markTestAccounts = async () => {
  const dryRun = process.argv.includes("--dry-run");

  try {
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    logger.info(`Connected to MongoDB ${dryRun ? "(DRY RUN)" : ""}`);

    if (dryRun) {
      const usersToUpdate = await User.find({
        email: { $in: TEST_EMAILS },
        testAccount: { $ne: true },
      });
      logger.info(
        `[DRY RUN] Found ${usersToUpdate.length} users to mark as test accounts.`,
      );
      usersToUpdate.forEach((u) => logger.info(`  - ${u.email}`));
    } else {
      const result = await User.updateMany(
        { email: { $in: TEST_EMAILS } },
        { $set: { testAccount: true } },
      );
      const modifiedCount = result.modifiedCount || result.nModified || 0;
      const matchedCount = result.matchedCount || result.n || 0;
      logger.info(
        `Successfully matched ${matchedCount} users and modified ${modifiedCount} as test accounts.`,
      );
    }

    logger.info(`Execution completed.`);
    process.exit(0);
  } catch (error) {
    logger.error("Error marking test accounts:", error);
    process.exit(1);
  }
};

markTestAccounts();
