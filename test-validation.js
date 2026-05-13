const Joi = require('joi');
const { createGig } = require('./src/validations/gig.validation');

// Test data exactly like frontend sends
const testData = {
  title: "Test Gig",
  description: "Test description for the gig",
  category: "3D Design",
  aiCustomInstructions: "",
  packages: {
    basic: {
      title: "Basic Package",
      description: "Test description for the gig",
      price: 25,
      revisions: 1,
      features: [],
      duration: "",
      instrument: "",
    },
  },
  tags: [],
  videos: [],
  images: [],
  coverImageIndex: 0,
  status: "draft",
  isActive: true,
};

console.log('Testing validation with data:', JSON.stringify(testData, null, 2));

const { value, error } = createGig.body.validate(testData);

if (error) {
  console.log('Validation error:', error.details);
  error.details.forEach(detail => {
    console.log(`- ${detail.path.join('.')}: ${detail.message}`);
  });
} else {
  console.log('Validation passed!');
  console.log('Validated data:', JSON.stringify(value, null, 2));
}