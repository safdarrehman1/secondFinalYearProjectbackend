const express = require('express');
const auth = require('../../middlewares/auth');
const hiringAssetController = require('../../controllers/hiringAsset.controller');

const router = express.Router();

router.route('/').post(auth('user'), hiringAssetController.createAsset).get(hiringAssetController.getAssets);
router.route('/my-assets').get(auth('user'), hiringAssetController.getMyAssets);
router.route('/user-assets-user/:userId').get(hiringAssetController.getUserAssets);
router.post('/cart/:assetId', auth('user'), hiringAssetController.addToCart);
router.get('/my/cart', auth('user'), hiringAssetController.getCart);
router.delete('/delete/cart/:assetId', auth('user'), hiringAssetController.removeFromCart);
router.delete('/clear/cart', auth('user'), hiringAssetController.clearCart);
router.post('/add/sale', auth('user'), hiringAssetController.addSale);
router.get('/get/sales', auth('user'), hiringAssetController.getSales);
router
  .route('/:assetId')
  .get(hiringAssetController.getAsset)
  .put(auth('user'), hiringAssetController.updateAsset);

module.exports = router;
