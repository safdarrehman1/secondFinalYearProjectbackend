const express = require('express');

const auth = require('../../middlewares/auth');

const uploadController = require('../../controllers/upload.controller');
const { uploadDynamic, uploadAssetFile } = require('../../middlewares/upload');

const router = express.Router();

router.route('/profile').post(auth('user'), uploadDynamic.single('profilePicture'), uploadController.uploadImage);
router.route('/job-image').post(auth('user'), uploadDynamic.single('jobImage'), uploadController.uploadImage);
router.route('/job-background').post(auth('user'), uploadDynamic.single('jobBackground'), uploadController.uploadImage);
router.route('/work-image').post(auth('user'), uploadDynamic.single('workImage'), uploadController.uploadImage);
router.route('/asset-image').post(auth('user'), uploadDynamic.single('assetImage'), uploadController.uploadImage);
router.route('/asset-file').post(auth('user'), uploadAssetFile.single('asset'), uploadController.uploadImage);

module.exports = router;
