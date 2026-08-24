const express = require("express");
const auth = require("../../middlewares/auth");
const upload = require("../../config/multer");
const applicationController = require("../../controllers/applicationController");

const router = express.Router();

router.get("/admin/all", auth("admin"), applicationController.getApplicationsAdmin);
router.patch("/admin/:applicationId/status", auth("admin"), applicationController.updateApplicationStatusAdmin);

router.post(
  "/apply/:jobId",
  auth(),
  upload.single("resume"),
  applicationController.applyToJob
);

router.get("/my-applications", auth(), applicationController.getMyApplications);
router.get("/job/:jobId", auth(), applicationController.listApplicationsForJob);
router.get("/:applicationId", auth(), applicationController.getApplicationStatus);
router.post("/:applicationId/generate-test", auth(), applicationController.generateTest);
router.post("/:applicationId/submit-test", auth(), applicationController.submitTestAnswers);
router.patch("/:applicationId/status", auth(), applicationController.updateApplicationStatus);
router.post("/:applicationId/interview", auth(), applicationController.scheduleInterview);
router.post("/:applicationId/offer", auth(), applicationController.extendFormalOffer);
router.post("/:applicationId/offer/decision", auth(), applicationController.decideFormalOffer);
router.get("/:applicationId/offer-letter", auth(), applicationController.downloadOfferLetter);
router.delete("/:applicationId", auth(), applicationController.withdrawApplication);

module.exports = router;
