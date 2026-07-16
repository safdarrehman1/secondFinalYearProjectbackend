const express = require('express');
const auth = require('../../middlewares/auth');
const controller = require('../../controllers/skillGapCreation.controller');

const router = express.Router();
router.get('/', controller.getWorks);
router.get('/mine', auth(), controller.getMyWorks);
router.get('/user/:userId', controller.getUserWorks);
router.get('/:id', controller.getWork);
router.post('/', auth(), controller.createWork);
router.put('/update/:id', auth(), controller.updateWork);
router.delete('/:id', auth(), controller.deleteWork);

module.exports = router;
