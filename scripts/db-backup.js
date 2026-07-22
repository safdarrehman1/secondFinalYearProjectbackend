const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const config = require("../src/config/config");
const logger = require("../src/config/logger");

const BACKUP_DIR = path.join(__dirname, "../backups");

const runBackup = async () => {
  logger.info("Starting database backup...");

  // Ensure backup directory exists
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  // Connect to DB if not connected
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
  }

  const db = mongoose.connection.db;
  const collections = await db.listCollections().toArray();
  const backupData = {};

  for (const col of collections) {
    const name = col.name;
    if (name.startsWith("system.")) continue;

    logger.info(`Dumping collection: ${name}`);
    const docs = await db.collection(name).find({}).toArray();
    backupData[name] = docs;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupFile = path.join(BACKUP_DIR, `backup-${timestamp}.json.gz`);

  const jsonStr = JSON.stringify(backupData);
  const compressed = zlib.gzipSync(jsonStr);
  fs.writeFileSync(backupFile, compressed);

  logger.info(`Database backup completed successfully: ${backupFile}`);

  // Rotate backups: keep only last 7 days
  const files = fs.readdirSync(BACKUP_DIR);
  const now = Date.now();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

  for (const file of files) {
    if (file.startsWith("backup-") && file.endsWith(".json.gz")) {
      const filePath = path.join(BACKUP_DIR, file);
      const stat = fs.statSync(filePath);
      const ageMs = now - stat.mtimeMs;
      if (ageMs > sevenDaysMs) {
        fs.unlinkSync(filePath);
        logger.info(`Deleted old backup file: ${file}`);
      }
    }
  }
};

if (require.main === module) {
  runBackup()
    .then(() => {
      logger.info("Backup script finished.");
      process.exit(0);
    })
    .catch((err) => {
      logger.error("Backup script failed:", err);
      process.exit(1);
    });
}

module.exports = runBackup;
