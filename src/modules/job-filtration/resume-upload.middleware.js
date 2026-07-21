const multer = require("multer");
const allowed = new Set(["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain"]);
module.exports = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 1 }, fileFilter: (req, file, callback) => { const valid = allowed.has(file.mimetype); callback(valid ? null : new Error("Only PDF, DOC, DOCX, and TXT resumes are supported"), valid); } });
