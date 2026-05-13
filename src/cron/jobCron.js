const cron = require("node-cron");
const { Job } = require("../models");

const initJobCron = () => {
  // Run every day at midnight (0 0 * * *)
  cron.schedule("0 0 * * *", async () => {
    console.log("Running Job Expiration Cron...");
    try {
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
      console.error("Cron Error:", error);
    }
  });

  console.log("Job Expiration Cron initialized.");
};

module.exports = initJobCron;
