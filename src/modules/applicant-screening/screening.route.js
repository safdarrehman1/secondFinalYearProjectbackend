const express = require('express');
const auth = require('../../middlewares/auth');
const controller = require('./screening.controller');
const aiController = require('../../controllers/ai.controller');
const rateLimit = require('express-rate-limit');

const router = express.Router();
const messageLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, max: 3,
  keyGenerator: (req) => `${req.user?.id || req.ip}:${req.body?.jobId || 'unknown'}`,
  handler: (_req, res) => res.status(429).send({ success: false, message: 'You can generate up to 3 messages for this application per day.' }),
});
router.post('/generate-message', auth(), messageLimiter, aiController.generateApplicationMessage);
router.post('/:id/generate-questionnaire', auth(), controller.generateQuestionnaire);
router.post('/:id/questionnaire/submit', auth(), controller.submitQuestionnaire);
router.post('/:id/questionnaire/disqualify', auth(), controller.disqualify);
module.exports = router;
