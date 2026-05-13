const Joi = require('joi');
const { createGig } = require('./src/validations/gig.validation');

// All categories from frontend
const frontendCategories = [
  "3D Design",
  "Architecture", 
  "Interior Design",
  "Industrial Design",
  "Home & Lifestyle Product Design",
  "Landscape Design",
  "Urban Design",
  "Exhibition & Experience Design",
  "Transportation Design",
  "Game & Film Environment Design",
  "BIM & Parametric Design",
  "Video Design"
];

// Music categories
const musicCategories = [
  "music-production",
  "mixing-mastering", 
  "songwriting",
  "vocal-recording",
  "beat-making",
  "lyrics-writing",
  "voice-over",
  "podcast-editing",
  "sound-design",
  "jingle-creation",
  "instruments",
  "composition",
  "vocals",
  "audio-engineering"
];

const allCategories = [...frontendCategories, ...musicCategories, "other"];

console.log('Testing all categories...\n');

const baseTestData = {
  title: "Test Gig",
  description: "Test description for the gig",
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

let passedCount = 0;
let failedCount = 0;

allCategories.forEach(category => {
  const testData = { ...baseTestData, category };
  const { error } = createGig.body.validate(testData);
  
  if (error) {
    console.log(`❌ FAILED: "${category}"`);
    console.log(`   Error: ${error.details[0].message}\n`);
    failedCount++;
  } else {
    console.log(`✅ PASSED: "${category}"`);
    passedCount++;
  }
});

console.log(`\nSummary:`);
console.log(`✅ Passed: ${passedCount}`);
console.log(`❌ Failed: ${failedCount}`);
console.log(`Total: ${allCategories.length}`);

if (failedCount === 0) {
  console.log('\n🎉 All categories are valid!');
} else {
  console.log('\n⚠️  Some categories failed validation.');
}