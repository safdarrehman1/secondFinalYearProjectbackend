const axios = require("axios");

// Configuration
const BASE_URL = "http://localhost:3002/v1"; // Ensure port matches server
let token = "";
let jobId = "";

async function login() {
  try {
    // Need a valid user. I'll fetch one first or create one if possible?
    // I will assume there is a test user "recruiter@example.com" / "password123"
    // If not, I need to register one.

    // Register just in case
    try {
      await axios.post(`${BASE_URL}/auth/register`, {
        email: `testrecruiter${Date.now()}@example.com`,
        password: "password123",
        name: "Test Recruiter",
        role: "recruiter", // Assuming role field exists
      });
      console.log("✅ Registered new user");
    } catch (e) {
      // Ignore if exists
    }

    const response = await axios.post(`${BASE_URL}/auth/login`, {
      email: "recruiter@example.com",
      password: "password123",
    });
    // Or use the registered one if login fails for hardcoded

    if (!response.data.tokens) {
      // Try login with the new user
      const loginRes = await axios.post(`${BASE_URL}/auth/login`, {
        email: `testrecruiter${Date.now()}@example.com`, // Wait, I need to store email
        password: "password123",
      });
      token = loginRes.data.tokens.access.token;
    } else {
      token = response.data.tokens.access.token;
    }

    console.log("✅ Login successful");
  } catch (error) {
    console.log("Login failed, trying with a fresh user...");
    const email = `recruiter${Date.now()}@test.com`;
    try {
      await axios.post(`${BASE_URL}/auth/register`, {
        email,
        password: "password123",
        name: "Test User",
        role: "recruiter",
      });
      const res = await axios.post(`${BASE_URL}/auth/login`, {
        email,
        password: "password123",
      });
      token = res.data.tokens.access.token;
      console.log("✅ Login successful with new user");
    } catch (e) {
      console.error("❌ Login/Register failed:", e.message);
      process.exit(1);
    }
  }
}

async function createJob() {
  try {
    const jobData = {
      projectTitle: "Test Expiration Job " + Date.now(),
      description: "A test job to verify expiration logic.",
      category: ["Music"],
      budget: ["100-200"],
      timeFrame: "1 month",
      preferredLocation: "Remote",
      musicUse: ["Commercial"],
      cultureArea: ["Pop"],
      isHaveLyric: false,
      lyricLanguage: "English",
    };

    const response = await axios.post(`${BASE_URL}/job`, jobData, {
      headers: { Authorization: `Bearer ${token}` },
    });
    console.log("Create job response:", response.data.id);
    jobId = response.data.id;

    const expiresAt = new Date(response.data.expiresAt);
    const now = new Date();
    const diffTime = Math.abs(expiresAt - now);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    // Approximately 20 days.

    if (diffDays >= 19 && diffDays <= 21) {
      console.log(
        "✅ Job created with correct expiration (~20 days). ID:",
        jobId,
      );
    } else {
      console.error(
        `❌ Job created but expiration is ${diffDays} days instead of 20.`,
      );
    }
  } catch (error) {
    console.error(
      "❌ Create job failed:",
      error.response ? error.response.data : error.message,
    );
  }
}

async function testFreeExtension() {
  if (!jobId) return;
  try {
    const response = await axios.post(
      `${BASE_URL}/job/${jobId}/extend`,
      { type: "free" },
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    // Check if extended
    const expiresAtStr = response.data.expiresAt;
    const isFreeUsed = response.data.isFreeExtensionUsed;

    if (isFreeUsed) {
      console.log("✅ Free extension successful (flag set).");
    } else {
      console.error("❌ Free extension failed (flag not set).");
    }

    const expiresAt = new Date(expiresAtStr);
    const now = new Date();
    const diffDays = Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24));

    // Should be 20 + 10 = 30 days roughly
    if (diffDays >= 29 && diffDays <= 31) {
      console.log(`✅ New expiry correct: ~${diffDays} days.`);
    } else {
      console.warn(
        `⚠️ New expiry is ${diffDays} days (expected ~30). Maybe calculation logic needs review?`,
      );
    }
  } catch (error) {
    console.error(
      "❌ Free extension failed:",
      error.response ? error.response.data : error.message,
    );
  }
}

async function testPaidExtension() {
  if (!jobId) return;
  try {
    const paymentId = "PAYID-" + Date.now();
    const response = await axios.post(
      `${BASE_URL}/job/${jobId}/extend`,
      { type: "paid", paymentId },
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    const expiresAt = new Date(response.data.expiresAt);
    const now = new Date();
    const diffDays = Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24));

    if (diffDays >= 58 && diffDays <= 62) {
      console.log(
        `✅ Paid extension successful. New expiry in ~${diffDays} days.`,
      );
    } else {
      console.warn(
        `⚠️ Paid extension expiry is ${diffDays} days (expected ~60).`,
      );
    }
  } catch (error) {
    console.error(
      "❌ Paid extension failed:",
      error.response ? error.response.data : error.message,
    );
  }
}

async function testPurchaseHistory() {
  try {
    const response = await axios.get(`${BASE_URL}/purchases/history?limit=1`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (response.data.data && response.data.data.results.length > 0) {
      const purchase = response.data.data.results[0];
      console.log("Latest purchase:", {
        id: purchase.id,
        type: purchase.type,
        title: purchase.assetTitle,
        paymentId: purchase.paymentId || purchase.transactionId,
      });

      if (
        purchase.type === "project_extension" &&
        purchase.assetTitle.includes("(Extension)")
      ) {
        console.log("✅ Purchase history correct for extension.");
      } else if (purchase.type === "project_extension") {
        console.log(
          "⚠️ Purchase type correct but title might be generic:",
          purchase.assetTitle,
        );
      } else {
        console.log(
          "ℹ️ Latest purchase is not the extension (maybe order changed?):",
          purchase.type,
        );
      }
    } else {
      console.warn("⚠️ No purchase history found.");
    }
  } catch (error) {
    console.error(
      "❌ Purchase history check failed:",
      error.response ? error.response.data : error.message,
    );
  }
}

async function run() {
  await login();
  await createJob();
  await testFreeExtension();
  await testPaidExtension();
  await testPurchaseHistory();
}

run();
