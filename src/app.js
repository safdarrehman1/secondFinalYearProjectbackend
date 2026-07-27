const express = require("express");
const fs = require("fs");
const path = require("path");
const helmet = require("helmet");
const xss = require("xss-clean");
const mongoSanitize = require("express-mongo-sanitize");
const compression = require("compression");
const cors = require("cors");
const passport = require("passport");
const httpStatus = require("http-status");
const session = require("express-session");
const config = require("./config/config");
const morgan = require("./config/morgan");
const { jwtStrategy } = require("./config/passport");
const { authLimiter, apiLimiter } = require("./middlewares/rateLimiter");
const routes = require("./routes/v1");
const filtrationRoutes = require("./modules/job-filtration/filtration.route");
const { errorConverter, errorHandler } = require("./middlewares/error");
const ApiError = require("./utils/ApiError");
const AttachmentCleanupService = require("./services/attachmentCleanup.service");
const { corsOptions } = require("./config/cors");
const requestContext = require("./middlewares/requestContext");

const app = express();
global.__basedir = __dirname;
app.set("trust proxy", 1);
app.use(requestContext);
app.use(express.static("public"));
app.get("/job-assets/others/:userId/:filename", (req, res, next) => {
  const { userId, filename } = req.params;
  if (!/^[a-f\d]{24}$/i.test(userId) || path.basename(filename) !== filename) {
    return next();
  }

  const directory = path.resolve(__dirname, "../public/job-assets/others", userId);
  const requestedName = filename.replace(/^\d+-/, "");
  const normalizedName = requestedName.replace(/[^a-z\d.]/gi, "").toLowerCase();

  fs.readdir(directory, (error, entries) => {
    if (error) return next();
    const matchingFiles = entries
      .filter((entry) => {
        const entryName = entry.replace(/^\d+-/, "");
        return entryName.replace(/[^a-z\d.]/gi, "").toLowerCase() === normalizedName;
      })
      .sort((left, right) => {
        const leftTimestamp = Number(left.split("-", 1)[0]) || 0;
        const rightTimestamp = Number(right.split("-", 1)[0]) || 0;
        return rightTimestamp - leftTimestamp;
      });

    if (!matchingFiles.length) return next();
    return res.sendFile(path.join(directory, matchingFiles[0]), (sendError) => {
      if (sendError) next(sendError);
    });
  });
});

if (config.env !== "test") {
  app.use(morgan.successHandler);
  app.use(morgan.errorHandler);
}

// set security HTTP headers
app.use(helmet());

// parse json request body
app.use(express.json({ limit: config.bodyLimit }));

// parse urlencoded request body
app.use(express.urlencoded({ extended: true, limit: config.bodyLimit }));

// session middleware for OAuth state management
app.use(
  session({
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: config.env === "production",
      sameSite: "lax",
      maxAge: 300000, // 5 minutes
    },
  }),
);

// sanitize request data
app.use(xss());
app.use(mongoSanitize());

// gzip compression
app.use(compression());

// enable cors
app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

// jwt authentication
app.use(passport.initialize());
passport.use("jwt", jwtStrategy);

// limit repeated failed requests to auth endpoints
if (config.env === "production") {
  app.use("/v1/auth", authLimiter);
}

app.get("/health", (req, res) => res.status(200).json({ status: "ok" }));
app.get("/ready", (req, res) => {
  const ready = require("mongoose").connection.readyState === 1;
  res.status(ready ? 200 : 503).json({ status: ready ? "ready" : "not_ready" });
});
// v1 api routes
app.use("/v1", apiLimiter, routes);
app.use("/api", apiLimiter, filtrationRoutes);

app.get("/", (req, res) => {
  res.send("Welcome! Backend Tech Hiring App Running Normally. v4");
});

// Initialize attachment cleanup scheduler (moved to index.js after DB connect)
// Removed from here to prevent running before MongoDB is ready

// send back a 404 error for any unknown api request
app.use((req, res, next) => {
  next(new ApiError(httpStatus.NOT_FOUND, "Not found"));
});

// convert error to ApiError, if needed
app.use(errorConverter);

// handle error
app.use(errorHandler);

module.exports = app;
