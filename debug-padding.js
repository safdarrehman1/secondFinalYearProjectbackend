const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const { ShareMusicAsset } = require("./src/models");

const run = async () => {
  console.log("=== STARTING SCRIPT ===");
  console.log("MONGO_URL: ", process.env.MONGODB_URL ? "Exists" : "MISSING");
  try {
    console.log("Connecting to DB...");
    await mongoose.connect(process.env.MONGODB_URL, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("Connected to DB successfully.");

    const TARGET_COUNT = 30;
    let blockedUsers = [];
    let existingIds = [];
    const needed = 30;

    const fillPipeline = [
      {
        $match: {
          _id: { $nin: existingIds },
          createdBy: { $nin: blockedUsers },
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "createdBy",
          foreignField: "_id",
          as: "sellerInfo",
        },
      },
      { $unwind: { path: "$sellerInfo", preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          priorityScore: {
            $add: [
              {
                $multiply: [
                  { $ifNull: ["$sellerInfo.sellerMetrics.averageRating", 0] },
                  10,
                ],
              },
              {
                $multiply: [
                  { $ifNull: ["$sellerInfo.sellerMetrics.totalOrders", 0] },
                  2,
                ],
              },
              { $ifNull: ["$sellerInfo.sellerMetrics.totalReviews", 0] },
            ],
          },
        },
      },
      { $sort: { priorityScore: -1, updatedAt: -1, createdAt: -1 } },
      { $limit: needed },
    ];

    console.log("Executing aggregate pipeline...");
    const additionalAssets = await ShareMusicAsset.aggregate(fillPipeline);
    console.log("Got additional assets length: ", additionalAssets.length);

    process.exit(0);
  } catch (e) {
    console.error("FATAL ERROR: ", e);
    process.exit(1);
  }
};

run();
