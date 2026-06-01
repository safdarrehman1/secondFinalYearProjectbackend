const express = require('express');
const authRoute = require('./auth.route');
const userRoute = require('./user.route');
const userSpaceRoute = require('./userSpace.route');
const jobsRoute = require('./job.route');
const chatRoutes = require('./chat.route');
const aiRoute = require('./ai.route');
const uploadRoute = require('./upload.route');
const contactUsRoute = require('./contactUs.route');
const config = require('../../config/config');

const router = express.Router();

const defaultRoutes = [
  { path: '/auth', route: authRoute },
  { path: '/users', route: userRoute },
  { path: '/user-space', route: userSpaceRoute },
  { path: '/job', route: jobsRoute },
  { path: '/chat-system', route: chatRoutes },
  { path: '/ai', route: aiRoute },
  { path: '/upload', route: uploadRoute },
  { path: '/contact-us', route: contactUsRoute },
];

defaultRoutes.forEach((r) => router.use(r.path, r.route));

/* istanbul ignore next */
if (config.env === 'development') {
  // keep docs only in development
  const docsRoute = require('./docs.route');
  router.use('/docs', docsRoute);
}

module.exports = router;
