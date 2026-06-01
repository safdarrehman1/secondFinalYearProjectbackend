const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} = require("@aws-sdk/client-s3");
const multer = require("multer");
const path = require("path");
const fs = require("fs").promises;
const { PassThrough } = require("stream");

// AWS SDK v3 setup
const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// Multer memory storage (we manually upload to S3 later)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: function (req, file, cb) {
    // Allow all file types for delivery uploads
    // If needed, enforce restrictions per-field elsewhere
    cb(null, true);
  },
});

// Upload file to S3 manually
async function uploadFileToS3(file, userId = "anonymous") {
  const fileExt = path.extname(file.originalname);
  let folder = "job-assets/others";

  if (file.fieldname === "profilePicture") folder = "uploads/profile-pictures";
  if (file.fieldname === "jobImage") folder = "job-assets/images";
  if (file.fieldname === "jobFile") folder = "job-assets/files";
  if (file.fieldname === "jobBackground") folder = "job-assets/backgrounds";
  if (
    file.fieldname === "attachment" ||
    file.fieldname === "cancellationAttachment"
  )
    folder = "uploads/cancellation-attachments";

  const filename = `${Date.now()}-${path.basename(file.originalname)}`;
  const key = `${folder}/${userId}/${filename}`;

  if (
    !process.env.AWS_ACCESS_KEY_ID ||
    !process.env.AWS_SECRET_ACCESS_KEY ||
    !process.env.AWS_BUCKET_NAME ||
    !process.env.AWS_REGION
  ) {
    const localPath = path.join(__dirname, "../../public", ...key.split("/"));
    await fs.mkdir(path.dirname(localPath), { recursive: true });
    await fs.writeFile(localPath, file.buffer);
    const baseUrl = process.env.BACKEND_URL || process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;

    return {
      url: `${baseUrl.replace(/\/$/, "")}/${key}`,
      key,
    };
  }

  const uploadParams = {
    Bucket: process.env.AWS_BUCKET_NAME,
    Key: key,
    Body: file.buffer,
    ContentType: file.mimetype,
    // ACL: 'public-read',
  };

  await s3.send(new PutObjectCommand(uploadParams));

  return {
    url: `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`,
    key,
  };
}

// Get file stream from S3
async function getFileStreamFromS3(fileKey) {
  const downloadParams = {
    Bucket: process.env.AWS_BUCKET_NAME,
    Key: fileKey,
  };

  const { Body, ContentType, ContentLength } = await s3.send(
    new GetObjectCommand(downloadParams),
  );
  return { Body, ContentType, ContentLength };
}

module.exports = {
  upload,
  uploadFileToS3,
  getFileStreamFromS3,
};
