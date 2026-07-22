const httpStatus = require('http-status');
const mongoose = require('mongoose');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const HiringAsset = require('../models/hiringAsset.model');
const User = require('../models/user.model');
const UserSpace = require('../models/userSpace.model');
const Sale = require('../models/sale.model');

const enrichAssetsWithCreators = async (assets) => {
  const rows = Array.isArray(assets) ? assets : [assets];
  const creatorIds = [...new Set(rows.map((asset) => asset.createdBy.toString()))];
  const [users, spaces] = await Promise.all([
    User.find({ _id: { $in: creatorIds } }).select('name profilePicture').lean(),
    UserSpace.find({ createdBy: { $in: creatorIds } })
      .select('createdBy firstName lastName profilePicture location creationOccupation hiring softwareTool')
      .lean(),
  ]);
  const usersById = new Map(users.map((user) => [user._id.toString(), user]));
  const spacesById = new Map(spaces.map((space) => [space.createdBy, space]));

  const enriched = rows.map((asset) => {
    const value = asset.toJSON ? asset.toJSON() : asset;
    const creatorId = asset.createdBy.toString();
    const user = usersById.get(creatorId);
    const space = spacesById.get(creatorId);
    const spaceName = [space?.firstName, space?.lastName].filter(Boolean).join(' ');
    return {
      ...value,
      createdBy: creatorId,
      userName: spaceName || user?.name || 'Creator',
      creatorName: spaceName || user?.name || 'Creator',
      profilePicture: space?.profilePicture || user?.profilePicture || '',
      location: space?.location || '',
      creationOccupation: space?.creationOccupation || [],
      hiring: space?.hiring || '',
      creatorSoftwareTools: space?.softwareTool || [],
      musicImage: value.assetImages?.[0] || '',
      workImages: value.assetImages || [],
      personalUsePrice: value.personalLicensePrice,
      commercialUsePrice: value.commercialLicensePrice,
    };
  });

  return Array.isArray(assets) ? enriched : enriched[0];
};

const createAsset = catchAsync(async (req, res) => {
  const asset = await HiringAsset.create({
    ...req.body,
    createdBy: req.user.id,
  });
  res.status(httpStatus.CREATED).send(await enrichAssetsWithCreators(asset));
});

const getAssets = catchAsync(async (req, res) => {
  const filter = {};
  if (req.query.category) filter.category = req.query.category;
  if (req.query.status) filter.status = req.query.status;
  else filter.status = 'published';
  if (req.query.search) {
    const search = String(req.query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { title: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } },
      { tags: { $regex: search, $options: 'i' } },
    ];
  }
  const assets = await HiringAsset.find(filter).sort({ createdAt: -1 });
  res.send(await enrichAssetsWithCreators(assets));
});

const getAsset = catchAsync(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.assetId)) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Asset not found');
  }
  const asset = await HiringAsset.findById(req.params.assetId);
  if (!asset) throw new ApiError(httpStatus.NOT_FOUND, 'Asset not found');
  res.send(await enrichAssetsWithCreators(asset));
});

const getMyAssets = catchAsync(async (req, res) => {
  const assets = await HiringAsset.find({ createdBy: req.user.id }).sort({ createdAt: -1 });
  res.send(await enrichAssetsWithCreators(assets));
});

const getUserAssets = catchAsync(async (req, res) => {
  const assets = await HiringAsset.find({
    createdBy: req.params.userId,
    status: 'published',
  }).sort({ createdAt: -1 });
  res.send(await enrichAssetsWithCreators(assets));
});

const updateAsset = catchAsync(async (req, res) => {
  const asset = await HiringAsset.findOneAndUpdate(
    { _id: req.params.assetId, createdBy: req.user.id },
    { $set: req.body },
    { new: true, runValidators: true },
  );
  if (!asset) throw new ApiError(httpStatus.NOT_FOUND, 'Asset not found');
  res.send(await enrichAssetsWithCreators(asset));
});

const addToCart = catchAsync(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.assetId)) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Asset not found');
  }

  const asset = await HiringAsset.findById(req.params.assetId);
  if (!asset) throw new ApiError(httpStatus.NOT_FOUND, 'Asset not found');

  const user = await User.findById(req.user.id);
  if (!user) throw new ApiError(httpStatus.NOT_FOUND, 'User not found');

  const alreadyInCart = user.assetCart.some(
    (item) => item.assetId.toString() === req.params.assetId && !item.paid,
  );
  if (!alreadyInCart) {
    user.assetCart.push({ assetId: asset._id, paid: false });
    await user.save();
  }

  res.status(httpStatus.OK).send({ message: 'Asset added to cart' });
});

const getCart = catchAsync(async (req, res) => {
  const user = await User.findById(req.user.id).populate('assetCart.assetId');
  if (!user) throw new ApiError(httpStatus.NOT_FOUND, 'User not found');

  const availableItems = user.assetCart.filter((item) => item.assetId && !item.paid);
  const assets = await enrichAssetsWithCreators(availableItems.map((item) => item.assetId));
  const cart = availableItems.map((item, index) => ({
    _id: item._id,
    assetId: assets[index],
    paid: item.paid,
  }));

  res.send(cart);
});

const removeFromCart = catchAsync(async (req, res) => {
  await User.findByIdAndUpdate(req.user.id, {
    $pull: { assetCart: { assetId: req.params.assetId } },
  });
  res.send({ message: 'Asset removed from cart' });
});

const Purchase = require('../models/purchase.model');

const addSale = catchAsync(async (req, res) => {
  const saleData = req.body.saleData || req.body;
  
  let asset = null;
  if (saleData.assetId && mongoose.Types.ObjectId.isValid(saleData.assetId)) {
    asset = await HiringAsset.findById(saleData.assetId);
  }

  const buyer = await User.findById(req.user.id).select('name');
  let creator = null;
  if (asset && asset.createdBy) {
    creator = await User.findById(asset.createdBy).select('name');
  } else if (saleData.OwnerId && mongoose.Types.ObjectId.isValid(saleData.OwnerId)) {
    creator = await User.findById(saleData.OwnerId).select('name');
  }

  const price = Number(saleData.assetPrice) || 0;
  const ownerId = asset?.createdBy || (saleData.OwnerId && mongoose.Types.ObjectId.isValid(saleData.OwnerId) ? saleData.OwnerId : req.user.id);
  const title = asset?.title || asset?.songName || saleData.assetTitle || 'Asset';

  const validMethods = ['paypal', 'stripe', 'card', 'simulated_fake_payment', 'wallet', 'free'];
  const rawMethod = saleData.paymentMethod || 'simulated_fake_payment';
  const paymentMethod = validMethods.includes(rawMethod) ? rawMethod : 'simulated_fake_payment';

  const sale = await Sale.create({
    assetId: asset?._id || (mongoose.Types.ObjectId.isValid(saleData.assetId) ? saleData.assetId : null),
    OwnerId: ownerId,
    buyerId: req.user.id,
    buyer: buyer?.name || saleData.buyer || 'Buyer',
    creatorName: creator?.name || saleData.creatorName || 'Creator',
    assetTitle: title,
    assetPrice: price,
    quantity: saleData.quantity || 1,
    totalAmount: price * (saleData.quantity || 1),
    paymentMethod: paymentMethod,
    paymentId: saleData.paymentId || `MOCK_${Date.now()}`,
    status: 'completed',
  });

  // Also create a Purchase document so it appears in Purchase History (/profile/purchases)
  try {
    await Purchase.create({
      user: req.user.id,
      type: 'project',
      amount: price * (saleData.quantity || 1),
      currency: 'USD',
      paymentMethod: paymentMethod,
      status: 'completed',
      transactionId: saleData.paymentId || `TXN_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      metadata: {
        assetId: saleData.assetId,
        assetTitle: title,
        licenseType: saleData.licenseType || 'Standard',
        creatorName: creator?.name || saleData.creatorName || 'Creator',
      },
    });
  } catch (err) {
    console.error('Error creating Purchase entry in addSale:', err.message);
  }

  // Empty the user's cart after completing sale
  await User.findByIdAndUpdate(req.user.id, {
    $set: { assetCart: [] },
  }).catch(() => {});

  res.status(httpStatus.CREATED).send(sale);
});

const clearCart = catchAsync(async (req, res) => {
  await User.findByIdAndUpdate(req.user.id, {
    $set: { assetCart: [] },
  });
  res.send({ message: 'Cart cleared successfully' });
});

const getSales = catchAsync(async (req, res) => {
  const sales = await Sale.find({
    $or: [{ buyerId: req.user.id }, { OwnerId: req.user.id }],
  }).sort({ createdAt: -1 });
  res.send(sales);
});

module.exports = {
  createAsset,
  getAssets,
  getAsset,
  getMyAssets,
  getUserAssets,
  updateAsset,
  addToCart,
  getCart,
  removeFromCart,
  clearCart,
  addSale,
  getSales,
};
