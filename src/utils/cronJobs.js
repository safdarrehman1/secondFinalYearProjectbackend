const cron = require("node-cron");
const AccountCleanupService = require("../services/accountCleanup.service");
const orderAutoCompletionService = require("../services/order-auto-completion.service");

/**
 * Initialize all cron jobs
 */
function initializeCronJobs() {
  // Complete delivered orders after the buyer review window expires.
  cron.schedule(
    "*/15 * * * *",
    async () => {
      try {
        const result = await orderAutoCompletionService.completeEligibleOrders();
        if (result.completed || result.failed) {
          console.log("Order auto-completion result:", result);
        }
      } catch (error) {
        console.error("Order auto-completion failed:", error);
      }
    },
    { scheduled: true, timezone: "UTC" }
  );

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
    }
  );

  // Run database backup daily at 3 AM
  cron.schedule(
    "0 3 * * *",
    async () => {
      console.log("Running Daily Database Backup Cron...");
      try {
        const runBackup = require("../../scripts/db-backup");
        await runBackup();
      } catch (error) {
        console.error("Cron Error (Database Backup):", error);
      }
    },
    {
      scheduled: true,
      timezone: "UTC",
    }
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
          `Cron: Expired ${result.nModified || result.modifiedCount} jobs.`
        );
      } catch (error) {
        console.error("Cron Error (Job Expiration):", error);
      }
    },
    {
      scheduled: true,
      timezone: "UTC",
    }
  );
}

module.exports = {
  initializeCronJobs,
};
