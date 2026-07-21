const express = require("express");
const { Job } = require("../../models");
const auth = require("../../middlewares/auth");
const router = express.Router();

router.post("/", auth("admin"), async (req, res) => {
  try {
    await Promise.all([Job.deleteMany({})]);

    res.json({ message: "All related collections cleared from the database." });
  } catch (error) {
    console.error("Error clearing collections:", error);
    res.status(500).json({ message: "Failed to clear collections." });
  }
});

module.exports = router;
