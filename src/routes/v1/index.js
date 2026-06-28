const express = require('express');
const authRoute = require('./auth.route');
const userRoute = require('./user.route');
const userSpaceRoute = require('./userSpace.route');
const jobsRoute = require('./job.route');
const chatRoutes = require('./chat.route');
const aiRoute = require('./ai.route');
const uploadRoute = require('./upload.route');
const contactUsRoute = require('./contactUs.route');
const blogRoute = require('./blog.route');
const purchaseRoute = require('./purchase.route');
const notificationRoute = require('./notification.route');
const orderHistoryRoute = require('./orderHistory.route');
const squareRoute = require('./square.route');
const stripeRoute = require('./stripe.route');
const gigRoute = require('./gig.route');
const servicesRoute = require('./services.route');
const attachmentCleanupRoute = require('./attachmentCleanup.route');
const ratingRoute = require('./rating.route');
const clearDatabaseRoute = require('./clearDatabaseRoute.route');
const orderRoutes = require('./order.route');
const reportRoute = require('./report_new.route');
const paypalRoutes = require('./payment.route');
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
  { path: '/blogs', route: blogRoute },
  { path: '/purchases', route: purchaseRoute },
  { path: '/notifications', route: notificationRoute },
  { path: '/orders', route: orderHistoryRoute },
  { path: '/square', route: squareRoute },
  { path: '/stripe', route: stripeRoute },
  { path: '/gigs', route: gigRoute },
  { path: '/services', route: servicesRoute },
  { path: '/attachment-cleanup', route: attachmentCleanupRoute },
  { path: '/ratings', route: ratingRoute },
  { path: '/clear-database', route: clearDatabaseRoute },
  { path: '/order', route: orderRoutes },
  { path: '/reports', route: reportRoute },
  { path: '/paypal', route: paypalRoutes },
];

defaultRoutes.forEach((r) => router.use(r.path, r.route));

/* istanbul ignore next */
if (config.env === 'development') {
  // keep docs only in development
  const docsRoute = require('./docs.route');
  router.use('/docs', docsRoute);
}

module.exports = router;
