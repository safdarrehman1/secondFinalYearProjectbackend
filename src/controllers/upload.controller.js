const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const User = require('../models/user.model');
const { uploadToCloudinary } = require('../utils/cloudinaryUpload');
const { uploadFileToS3 } = require('../utils/s3Upload');

/**
 * Handle multi-type file uploads (images, CVs, assets) to Cloudinary bucket with fallbacks
 */
const uploadImage = catchAsync(async (req, res) => {
  if (!req.file) {
    return res.status(400).send({ message: 'Please upload a file!' });
  }

  const user = await User.findById(req.user.id);
  if (!user) {
    return res.status(404).send({ message: 'User not found!' });
  }

  let uploadResult = null;
  try {
    // Primary upload to Cloudinary bucket
    uploadResult = await uploadToCloudinary(req.file, 'intelligent_hiring_assets');
  } catch (err) {
    console.error('Cloudinary upload warning:', err.message);
    try {
      uploadResult = await uploadFileToS3(req.file, user._id.toString());
    } catch (s3Err) {
      console.error('S3 fallback error:', s3Err.message);
      uploadResult = { url: `/uploads/${req.file.filename || req.file.originalname}` };
    }
  }

  const fileUrl = uploadResult.url || uploadResult.secure_url;

  // Determine response format depending on form field name
  let responseData = {};
  let message = 'File uploaded successfully';

  switch (req.file.fieldname) {
    case 'profilePicture':
      user.profilePicture = fileUrl;
      await user.save();
      responseData = { profilePicture: fileUrl, userId: user._id, url: fileUrl };
      message = 'Profile picture uploaded successfully';
      break;
    case 'profileCV':
      responseData = { profileCV: fileUrl, url: fileUrl };
      message = 'CV uploaded successfully';
      break;
    case 'jobImage':
      responseData = { jobImage: fileUrl, url: fileUrl };
      message = 'Job asset image uploaded successfully';
      break;
    case 'jobBackground':
      responseData = { jobBackground: fileUrl, url: fileUrl };
      message = 'Job asset background uploaded successfully';
      break;
    case 'workImage':
      responseData = { workImage: fileUrl, url: fileUrl };
      message = 'Work image uploaded successfully';
      break;
    case 'assetImage':
      responseData = { imageUrl: fileUrl, url: fileUrl };
      message = 'Asset image uploaded successfully';
      break;
    case 'asset':
      responseData = { assetUrl: fileUrl, url: fileUrl };
      message = 'Asset file uploaded successfully';
      break;
    default:
      responseData = { fileUrl, url: fileUrl };
      message = 'File uploaded successfully';
  }

  res.status(httpStatus.OK).send({
    message,
    data: responseData,
    url: fileUrl,
    cloudinary: uploadResult,
  });
});

module.exports = {
  uploadImage,
};
