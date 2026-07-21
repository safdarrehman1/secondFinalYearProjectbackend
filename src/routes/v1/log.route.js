const express = require("express");
const passport = require("passport");
const logController = require("../../controllers/log.controller");

const router = express.Router();

// Optional JWT authentication middleware to parse req.user if JWT is provided
const optionalAuth = (req, res, next) => {
  passport.authenticate("jwt", { session: false }, (err, user) => {
    if (user) {
      req.user = user;
    }
    next();
  })(req, res, next);
};

router.route("/error").post(optionalAuth, logController.logError);

module.exports = router;
