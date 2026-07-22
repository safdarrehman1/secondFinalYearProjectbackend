const { uploadToCloudinary } = require('../src/utils/cloudinaryUpload');
const path = require('path');

async function testUpload() {
  try {
    console.log('Testing Cloudinary upload with configured credentials...');
    const testFilePath = path.join(__dirname, '../../frontend/public/image/small_logo.png');
    const result = await uploadToCloudinary(testFilePath, 'test_folder');
    console.log('✅ Cloudinary Upload SUCCESSFUL!');
    console.log('Cloudinary Image URL:', result.url);
    console.log('Public ID:', result.public_id);
    process.exit(0);
  } catch (error) {
    console.error('❌ Cloudinary Upload Failed:', error);
    process.exit(1);
  }
}

testUpload();
