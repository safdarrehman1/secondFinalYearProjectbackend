const mongoose = require("mongoose");
const {
  User,
  ShareMusicAsset,
  ShareMusicCreation,
  UserSpace,
} = require("../src/models");
const shareMusicService = require("../src/services/shareMusic.service");
const config = require("../src/config/config");
const faker = require("faker");

const runTest = async () => {
  console.log("Connecting to MongoDB...");
  await mongoose.connect(config.mongoose.url, config.mongoose.options);
  console.log("Connected.");

  // Utility to check interleaving
  const checkInterleaving = (items, type) => {
    let consecutiveSameAuthor = false;
    for (let i = 0; i < items.length - 1; i++) {
      if (items[i].createdBy.toString() === items[i + 1].createdBy.toString()) {
        consecutiveSameAuthor = true;
        console.log(
          `[${type}] Mismatch at index ${i} and ${i + 1}: same author ${
            items[i].createdBy
          }`,
        );
      }
    }
    return !consecutiveSameAuthor;
  };

  // 1. Create Test Users with different metrics
  const testPrefix = `TEST_PRIO_${Date.now()}`;
  const users = [];
  for (let i = 0; i < 5; i++) {
    const user = await User.create({
      name: `${testPrefix}_USER_${i}`,
      email: `${testPrefix}_${i}@example.com`.toLowerCase(),
      password: "password1",
      sellerMetrics: {
        averageRating: 5 - i, // 5, 4, 3, 2, 1
        totalOrders: (5 - i) * 10,
        totalReviews: (5 - i) * 5,
      },
    });
    users.push(user);

    // Create UserSpace for them
    await UserSpace.create({
      firstName: `Test${i}`,
      lastName: `User${i}`,
      creationOccupation: ["Producer"],
      address: "Test Address",
      aboutMe: "Test About Me",
      profilePicture: "test_pp.jpg",
      createdBy: user._id.toString(),
      updatedBy: user._id.toString(),
    });
  }

  console.log(`Created ${users.length} test users.`);

  // 2. Create Test Assets for these users
  const assetCounts = [5, 3, 2, 1, 1];
  for (let i = 0; i < users.length; i++) {
    for (let j = 0; j < assetCounts[i]; j++) {
      await ShareMusicAsset.create({
        title: `${testPrefix}_Asset_${i}_${j}`,
        category: "TestCategory",
        personalLicensePrice: 10,
        commercialLicensePrice: 20,
        assetImages: ["test.jpg"],
        description: "Test asset",
        tags: ["test", "prio", "music", "asset"],
        createdBy: users[i]._id,
        updatedBy: users[i]._id,
        status: "published",
      });
    }
  }
  console.log("Created test assets.");

  // 3. Create Test Creations
  const creationCounts = [4, 2, 2, 1, 1];
  for (let i = 0; i < users.length; i++) {
    for (let j = 0; j < creationCounts[i]; j++) {
      await ShareMusicCreation.create({
        title: `${testPrefix}_Creation_${i}_${j}`,
        description: "Test creation",
        category: "TestCategory",
        tags: ["test", "prio"],
        createdBy: users[i]._id.toString(), // ShareMusicCreation uses String for createdBy in some versions, but model says String
        updatedBy: users[i]._id.toString(),
        status: "active",
        workType: "music",
      });
    }
  }
  console.log("Created test creations.");

  // 4. Test getAllAssets (No Filter)
  console.log("\n--- Testing getAllAssets (No Filter) ---");
  const allAssets = await shareMusicService.getAllAssets(null, {
    category: "All",
  });

  // Filter only our test assets for verification
  const myTestAssets = allAssets.filter((a) => a.title.startsWith(testPrefix));
  console.log(`Total test assets found interleaved: ${myTestAssets.length}`);

  if (checkInterleaving(myTestAssets, "Assets")) {
    console.log(
      "✅ Success: No consecutive assets from the same author in the test set!",
    );
  } else {
    console.log(
      "❌ Failure: Found consecutive assets from the same author in the test set.",
    );
  }

  // 5. Test getAllCreations (No Filter)
  console.log("\n--- Testing getAllCreations (No Filter) ---");
  const allCreations = await shareMusicService.getAllCreations(null, "All");

  const myTestCreations = allCreations.filter((c) =>
    c.title.startsWith(testPrefix),
  );
  console.log(
    `Total test creations found interleaved: ${myTestCreations.length}`,
  );

  if (checkInterleaving(myTestCreations, "Creations")) {
    console.log(
      "✅ Success: No consecutive creations from the same author in the test set!",
    );
  } else {
    console.log(
      "❌ Failure: Found consecutive creations from the same author in the test set.",
    );
  }

  // 6. Test Filter vs No Filter Limit
  console.log("\n--- Testing Limits ---");
  const TARGET_COUNT = 30;

  // If we query with filter 'TestCategory', and we have only ~12 assets, it should try to fill up to 30
  const filteredAssets = await shareMusicService.getAllAssets(null, {
    category: "TestCategory",
  });
  console.log(
    `Assets with filter 'TestCategory' count: ${filteredAssets.length}`,
  );
  if (
    filteredAssets.length >=
    Math.min(
      TARGET_COUNT,
      await ShareMusicAsset.countDocuments({ status: "published" }),
    )
  ) {
    console.log(
      "✅ Success: Filtered results respected target count / fill logic.",
    );
  }

  console.log("\nTest finished.");
  process.exit(0);
};

runTest().catch((err) => {
  console.error(err);
  process.exit(1);
});
