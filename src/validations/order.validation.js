const Joi = require("joi");
const { objectId } = require("./custom.validation");

const createOrder = {
  body: Joi.object()
    .keys({
      order: Joi.object().optional(),
      title: Joi.string().required(),
      price: Joi.number().required(),
      delivery_time: Joi.number(),
      status: Joi.string(),
      description: Joi.string(),
      recruiterId: Joi.string().custom(objectId),
      chat_id: Joi.string().custom(objectId),
      gig: Joi.string().custom(objectId),
    })
    .unknown(true),
};

const getOrder = {
  params: Joi.object().keys({
    orderId: Joi.string().custom(objectId),
  }),
};

const updateOrderStatus = {
  params: Joi.object().keys({
    orderId: Joi.required().custom(objectId),
  }),
  body: Joi.object()
    .keys({
      status: Joi.string().required(),
      message: Joi.string(),
    })
    .min(1),
};

const addReviewAndRating = {
  params: Joi.object().keys({
    orderId: Joi.required().custom(objectId),
  }),
  body: Joi.object()
    .keys({
      rating: Joi.number(),
      review: Joi.string(),
      buyerRating: Joi.number(),
      sellerRating: Joi.number(),
      buyerReview: Joi.string(),
      sellerReview: Joi.string(),
      tip: Joi.number(),
    })
    .min(1),
};

const replyToBuyerReview = {
  params: Joi.object().keys({
    orderId: Joi.required().custom(objectId),
  }),
  body: Joi.object().keys({
    reply: Joi.string().required().min(10).max(500),
  }),
};

const createPaypalOrder = {
  params: Joi.object().keys({
    orderId: Joi.required().custom(objectId),
  }),
};

const capturePaypalOrder = {
  params: Joi.object().keys({
    orderId: Joi.required().custom(objectId),
  }),
  body: Joi.object().keys({
    paypalOrderId: Joi.string().required(),
  }),
};

module.exports = {
  createOrder,
  getOrder,
  updateOrderStatus,
  addReviewAndRating,
  replyToBuyerReview,
  createPaypalOrder,
  capturePaypalOrder,
};
