const http = require("http");

const BASE_URL = "http://localhost:3002/v1/music-asset";

const fetchAssets = (queryString) => {
  return new Promise((resolve, reject) => {
    http
      .get(`${BASE_URL}${queryString ? "?" + queryString : ""}`, (res) => {
        let data = "";

        res.on("data", (chunk) => {
          data += chunk;
        });

        res.on("end", () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              reject(e);
            }
          } else {
            reject(new Error(`Status Code: ${res.statusCode}, Body: ${data}`));
          }
        });
      })
      .on("error", (err) => {
        reject(err);
      });
  });
};

const runTests = async () => {
  console.log("🚀 Starting Asset Filter Tests...\n");
  const failedTests = [];

  const checkResult = (name, assertion, value1, value2) => {
    if (assertion) {
      console.log(`✅ [PASS] ${name}`);
    } else {
      console.error(`❌ [FAIL] ${name}`);
      console.error(
        `   -> Expected condition failed. Got:`,
        value1,
        value2 || "",
      );
      failedTests.push(name);
    }
  };

  try {
    // 1. Test Base (No Filters)
    console.log("--- TEST: No Filters ---");
    const baseAssets = await fetchAssets("");
    console.log(
      `Fetched ${baseAssets.length} total assets (ignoring pagination).`,
    );
    checkResult("Base fetch works", Array.isArray(baseAssets), true);

    // 2. Test Price Filter (minPrice)
    console.log("\n--- TEST: minPrice=10 ---");
    const minPriceAssets = await fetchAssets("minPrice=10");
    console.log(`Fetched ${minPriceAssets.length} assets.`);
    let minPriceValid = true;
    for (const a of minPriceAssets) {
      const highestPrice = Math.max(
        Number(a.commercialLicensePrice || 0),
        Number(a.personalLicensePrice || 0),
        Number(a.extendedCommercialPrice || 0),
        Number(a.gameEnginePrice || 0),
        Number(a.broadcastFilmPrice || 0),
        Number(a.extendedRedistributionPrice || 0),
        Number(a.educationPrice || 0),
      );
      if (highestPrice < 10) {
        minPriceValid = false;
        console.error(
          `Asset ${a.id} failed minPrice test. Highest price: ${highestPrice}`,
        );
        break;
      }
    }
    checkResult("minPrice filtering", minPriceValid, true);
    checkResult(
      "minPrice padding algorithm matches 30 length",
      minPriceAssets.length === 30,
      true,
    );

    // 3. Test Category Filter (category=Architecture)
    // Testing URL encoding handles standard characters
    console.log("\n--- TEST: category=Architecture ---");
    const catQueryString = `category=${encodeURIComponent("Architecture")}`;
    const categoryAssets = await fetchAssets(catQueryString);
    console.log(`Fetched ${categoryAssets.length} assets.`);
    let categoryValid = true;
    // We expect the exact matches to appear at the very beginning of the array.
    // Padded assets appear afterwards and may not match the category.
    // Also, we want to know if an asset actually exists with this category in the DB.
    // Let's check if the base assets had any Architecture.
    const expectedArchMatches = baseAssets.filter(
      (a) => a.category === "Architecture",
    );
    const foundArchMatches = categoryAssets.filter(
      (a) => a.category === "Architecture",
    );

    if (expectedArchMatches.length > 0 && foundArchMatches.length === 0) {
      categoryValid = false;
      console.error("Category filter failed to pull the actual matches.");
    } else {
      categoryValid = true;
    }

    if (expectedArchMatches.length > 0) {
      checkResult(
        "category filtering returned results",
        categoryAssets.length > 0,
        true,
      );
    }
    checkResult("category exact match", categoryValid, true);
    checkResult(
      "category padding algorithm matches length",
      categoryAssets.length >= 29,
      true,
    );

    // 4. Test Multiple Categories (category=Architecture,Interior)
    console.log("\n--- TEST: category=Architecture,Interior ---");
    const catsQueryString = `category=${encodeURIComponent(
      "Architecture,Interior",
    )}`;
    const categoriesAssets = await fetchAssets(catsQueryString);
    console.log(`Fetched ${categoriesAssets.length} assets.`);
    let categoriesValid = true;

    // Check if the specific exact matches from base assets appear in the result
    const expectedCatMatches = baseAssets.filter(
      (a) => a.category === "Architecture" || a.category === "Interior",
    );
    const foundCatMatches = categoriesAssets.filter(
      (a) => a.category === "Architecture" || a.category === "Interior",
    );

    if (expectedCatMatches.length > 0 && foundCatMatches.length === 0) {
      categoriesValid = false;
      console.error("Filter failed to return the expected category items.");
    }
    checkResult("multiple categories mapping", categoriesValid, true);

    // 5. Test Search String
    if (baseAssets.length > 0 && baseAssets[0].title) {
      const titleToSearch = baseAssets[0].title.substring(0, 4);
      console.log(`\n--- TEST: search=${titleToSearch} ---`);
      const searchAssets = await fetchAssets(
        `search=${encodeURIComponent(titleToSearch)}`,
      );
      console.log(`Fetched ${searchAssets.length} assets.`);
      checkResult("Search returned results", searchAssets.length > 0, true);
    }

    // 6. Test Tag Search
    const assetWithTags = baseAssets.find((a) => a.tags && a.tags.length > 0);
    if (assetWithTags) {
      const tagToSearch = assetWithTags.tags[0];
      console.log(`\n--- TEST: search (tags)=${tagToSearch} ---`);
      const searchTagAssets = await fetchAssets(
        `search=${encodeURIComponent(tagToSearch)}`,
      );
      console.log(`Fetched ${searchTagAssets.length} assets.`);
      checkResult(
        "Tag search returned results",
        searchTagAssets.length > 0,
        true,
      );
    } else {
      console.log(`\n--- TEST: search (tags) ---`);
      console.log(
        "No assets with tags found in base set. Skipping tag search test.",
      );
    }

    console.log("\n🏁 Tests Completed.");
    if (failedTests.length === 0) {
      console.log("All tests passed! 🎉");
    } else {
      console.error(`${failedTests.length} tests failed. Please review.`);
    }
  } catch (error) {
    console.error("Test execution failed:", error);
  }
};

runTests();
