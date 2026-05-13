const cron = require("node-cron");
const AccountCleanupService = require("../services/accountCleanup.service");
const { virtualStatsService } = require("../services");

/**
 * Initialize all cron jobs
 */
function initializeCronJobs() {
  // Run account cleanup daily at 2 AM
  cron.schedule(
    "0 2 * * *",
    async () => {
      try {
        await AccountCleanupService.processScheduledDeletions();
      } catch (error) {
        console.error("Account cleanup failed:", error);
      }
    },
    {
      scheduled: true,
      timezone: "UTC",
    },
  );
  // Run job expiration check daily at midnight
  cron.schedule(
    "0 0 * * *",
    async () => {
      console.log("Running Job Expiration Cron...");
      try {
        const { Job } = require("../models");
        const result = await Job.updateMany(
          {
            status: "active",
            expiresAt: { $lt: new Date() },
          },
          {
            $set: { status: "inactive" },
          },
        );
        console.log(
          `Cron: Expired ${result.nModified || result.modifiedCount} jobs.`,
        );
      } catch (error) {
        console.error("Cron Error (Job Expiration):", error);
      }
    },
    {
      scheduled: true,
      timezone: "UTC",
    },
  );
  // Testing: Run cleanup every minute (uncomment for testing)
  // cron.schedule('* * * * *', async () => {
  //   console.log('Running account cleanup (testing - every minute)...');
  //   try {
  //     const result = await AccountCleanupService.processScheduledDeletions();
  //     console.log('Account cleanup completed:', result);
  //   } catch (error) {
  //     console.error('Account cleanup failed:', error);
  //   }
  // }, {
  //   scheduled: true,
  //   timezone: "UTC"
  // });

  // Run virtual stats increment daily at 1 AM
  cron.schedule(
    "0 1 * * *",
    async () => {
      console.log("Running Virtual Stats Increment Cron and Automation...");
      try {
        await virtualStatsService.incrementVirtualStats();
      } catch (error) {
        console.error("Cron Error (Virtual Stats/Automation):", error);
      }
    },
    {
      scheduled: true,
      timezone: "UTC",
    },
  );
}

module.exports = {
  initializeCronJobs,
};
