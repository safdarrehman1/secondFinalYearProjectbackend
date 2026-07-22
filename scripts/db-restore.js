const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const config = require("../src/config/config");
const logger = require("../src/config/logger");

const runRestore = async (backupFilePath) => {
  if (!backupFilePath) {
    throw new Error("Backup file path is required. Usage: node db-restore.js <path-to-backup-file>");
  }

  if (!fs.existsSync(backupFilePath)) {
    throw new Error(`Backup file does not exist: ${backupFilePath}`);
  }

  logger.info(`Starting database restoration from: ${backupFilePath}...`);

  // Connect to DB if not connected
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
  }

  const db = mongoose.connection.db;

  // Read and decompress backup
  const compressed = fs.readFileSync(backupFilePath);
  const jsonStr = zlib.gunzipSync(compressed).toString("utf8");
  const backupData = JSON.parse(jsonStr);

  for (const [colName, docs] of Object.entries(backupData)) {
    logger.info(`Restoring collection: ${colName} (${docs.length} documents)`);

    // Drop or clear collection
    const collections = await db.listCollections({ name: colName }).toArray();
    if (collections.length > 0) {
      await db.collection(colName).deleteMany({});
    }

    // Insert docs if not empty
    if (docs.length > 0) {
      const parsedDocs = docs.map((doc) => {
        const d = { ...doc };
        if (d._id) {
          if (typeof d._id === "object" && d._id.$oid) {
            d._id = new mongoose.Types.ObjectId(d._id.$oid);
          } else if (typeof d._id === "string" && d._id.length === 24) {
            d._id = new mongoose.Types.ObjectId(d._id);
          }
        }
        // Map common references back to ObjectId
        for (const [key, value] of Object.entries(d)) {
          if (value && typeof value === "object" && value.$oid) {
            d[key] = new mongoose.Types.ObjectId(value.$oid);
          } else if (
            value &&
            typeof value === "string" &&
            value.length === 24 &&
            (key.endsWith("Id") ||
              key === "user" ||
              key === "job" ||
              key === "candidate" ||
              key === "poster" ||
              key === "seller" ||
              key === "buyer" ||
              key === "applicant" ||
              key === "actor" ||
              key === "createdBy")
          ) {
            d[key] = new mongoose.Types.ObjectId(value);
          }
        }
        return d;
      });

      await db.collection(colName).insertMany(parsedDocs);
    }
  }

  logger.info("Database restoration completed successfully.");
};

if (require.main === module) {
  const filePath = process.argv[2];
  runRestore(filePath)
    .then(() => {
      logger.info("Restore script finished.");
      process.exit(0);
    })
    .catch((err) => {
      logger.error("Restore script failed:", err);
      process.exit(1);
    });
}

module.exports = runRestore;
