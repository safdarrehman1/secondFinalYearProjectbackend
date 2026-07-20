const express = require("express");
const auth = require("../../middlewares/auth");
const resumeController = require("../../controllers/resumeController");
const { upload } = require("../../utils/s3Upload");

const router = express.Router();

// Define rate limit for AI chat assist if we want to, or reuse authLimiter
const { authLimiter } = require("../../middlewares/rateLimiter");

router
  .route("/")
  .post(auth("user"), resumeController.createResume)
  .get(auth("user"), resumeController.listUserResumes);

router
  .route("/templates")
  .get(auth("user"), resumeController.listTemplates);

router
  .route("/chat-assist")
  .post(auth("user"), authLimiter, resumeController.chatAssist);

router
  .route("/:resumeId")
  .get(auth("user"), resumeController.getResume)
  .put(auth("user"), resumeController.updateResume)
  .delete(auth("user"), resumeController.deleteResume);

router
  .route("/:resumeId/export")
  .post(auth("user"), resumeController.exportResumePdf);

// Route for photo upload in resume (optional if user wants profile photo in resume)
const { uploadFileToS3 } = require("../../utils/s3Upload");
router.post(
  "/upload-photo",
  auth("user"),
  upload.fields([{ name: "photo", maxCount: 1 }]),
  async (req, res, next) => {
    try {
      const files = req.files;
      if (!files || !files.photo || !files.photo[0]) {
        return res.status(400).json({ success: false, message: "Photo file is required" });
      }
      const s3Response = await uploadFileToS3(files.photo[0], req.user.id);
      res.status(200).json({ success: true, url: s3Response.url });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
