// Test API call without authentication
const testData = {
  title: "Test Gig No Auth",
  description: "Test description for the gig without auth",
  category: "3D Design",
  aiCustomInstructions: "",
  packages: {
    basic: {
      title: "Basic Package",
      description: "Test description for the gig without auth",
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

fetch('http://localhost:3002/v1/gigs', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(testData)
})
.then(response => {
  console.log('Response status:', response.status);
  return response.json();
})
.then(data => {
  console.log('Response data:', JSON.stringify(data, null, 2));
})
.catch(error => {
  console.error('Error:', error);
});

console.log('Sending request without auth:', JSON.stringify(testData, null, 2));