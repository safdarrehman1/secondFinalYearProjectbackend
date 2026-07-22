const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const config = require('../config/config');

cloudinary.config({
  cloud_name: config.cloudinary.cloudName || process.env.CLOUDINARY_CLOUD_NAME || '',
  api_key: config.cloudinary.apiKey || process.env.CLOUDINARY_API_KEY || '',
  api_secret: config.cloudinary.apiSecret || process.env.CLOUDINARY_API_SECRET || '',
  secure: true,
});

/**
 * Upload a file (buffer or file path) to Cloudinary
 * @param {Object|string|Buffer} file - Express multer file object or path/buffer
 * @param {string} folderName - Optional target folder in Cloudinary
 * @returns {Promise<Object>} Cloudinary upload response object with secure_url
 */
const uploadToCloudinary = (file, folderName = 'intelligent_hiring_uploads') => {
  return new Promise((resolve, reject) => {
    const uploadOptions = {
      folder: folderName,
      resource_type: 'auto',
    };

    // If multer file object with buffer
    if (file && file.buffer) {
      const stream = cloudinary.uploader.upload_stream(uploadOptions, (error, result) => {
        if (error) return reject(error);
        resolve({
          url: result.secure_url || result.url,
          public_id: result.public_id,
          format: result.format,
          resource_type: result.resource_type,
          bytes: result.bytes,
          rawResponse: result,
        });
      });
      stream.end(file.buffer);
    }
    // If multer file object with local disk path
    else if (file && file.path) {
      cloudinary.uploader.upload(file.path, uploadOptions, (error, result) => {
        if (error) return reject(error);
        // Clean up temporary local file if exists
        fs.unlink(file.path, () => {});
        resolve({
          url: result.secure_url || result.url,
          public_id: result.public_id,
          format: result.format,
          resource_type: result.resource_type,
          bytes: result.bytes,
          rawResponse: result,
        });
      });
    }
    // If string path
    else if (typeof file === 'string') {
      cloudinary.uploader.upload(file, uploadOptions, (error, result) => {
        if (error) return reject(error);
        resolve({
          url: result.secure_url || result.url,
          public_id: result.public_id,
          format: result.format,
          resource_type: result.resource_type,
          bytes: result.bytes,
          rawResponse: result,
        });
      });
    } else {
      reject(new Error('Invalid file object or path provided for Cloudinary upload'));
    }
  });
};

module.exports = {
  cloudinary,
  uploadToCloudinary,
};
