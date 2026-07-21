const axios = require("axios");

const TARGET_URL = process.env.BACKEND_URL || "http://localhost:5051";
const CONCURRENCY = 100; // 100 parallel requests
const ENDPOINTS = ["/health", "/ready", "/"];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const runLoadTest = async () => {
  console.log(`==================================================`);
  console.log(`Starting Concurrency Load Test against: ${TARGET_URL}`);
  console.log(`Concurrency Limit: ${CONCURRENCY} parallel requests`);
  console.log(`==================================================\n`);

  const results = [];

  for (const endpoint of ENDPOINTS) {
    const url = `${TARGET_URL}${endpoint}`;
    console.log(`Testing endpoint: ${url}...`);

    const startTime = Date.now();
    const promises = [];

    for (let i = 0; i < CONCURRENCY; i++) {
      promises.push(
        (async () => {
          const reqStart = Date.now();
          try {
            const res = await axios.get(url, { timeout: 8000 });
            return {
              success: true,
              latency: Date.now() - reqStart,
              status: res.status,
            };
          } catch (err) {
            return {
              success: false,
              latency: Date.now() - reqStart,
              error: err.message,
            };
          }
        })()
      );
    }

    const responses = await Promise.all(promises);
    const totalTime = Date.now() - startTime;

    const successful = responses.filter((r) => r.success);
    const failed = responses.filter((r) => !r.success);

    const latencies = successful.map((r) => r.latency);
    const avgLatency = latencies.length
      ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
      : 0;
    const minLatency = latencies.length ? Math.min(...latencies) : 0;
    const maxLatency = latencies.length ? Math.max(...latencies) : 0;

    const rps = (CONCURRENCY / (totalTime / 1000)).toFixed(2);

    console.log(`Results for ${endpoint}:`);
    console.log(`  - Total Requests: ${CONCURRENCY}`);
    console.log(`  - Successful: ${successful.length}`);
    console.log(`  - Failed: ${failed.length}`);
    console.log(`  - Average Latency: ${avgLatency}ms`);
    console.log(`  - Min Latency: ${minLatency}ms`);
    console.log(`  - Max Latency: ${maxLatency}ms`);
    console.log(`  - Total Test Duration: ${totalTime}ms`);
    console.log(`  - Throughput (RPS): ${rps} req/sec`);
    console.log(`--------------------------------------------------\n`);

    results.push({
      endpoint,
      total: CONCURRENCY,
      success: successful.length,
      failed: failed.length,
      avgLatency,
      rps,
    });

    // Wait a brief moment before hitting the next endpoint
    await sleep(1000);
  }

  console.log(`Load test finished.`);
};

// Execute if run directly
if (require.main === module) {
  runLoadTest().catch((err) => {
    console.error("Load test runner crashed:", err);
    process.exit(1);
  });
}

module.exports = runLoadTest;
