// Test API call to create gig
const testData = {
  title: "Test Gig API",
  description: "Test description for the gig via API",
  category: "3D Design",
  aiCustomInstructions: "",
  packages: {
    basic: {
      title: "Basic Package",
      description: "Test description for the gig via API",
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

// You need to replace this with a valid token
const token = "YOUR_VALID_TOKEN_HERE";

fetch('http://localhost:3002/v1/gigs', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify(testData)
})
.then(response => {
  console.log('Response status:', response.status);
  console.log('Response headers:', Object.fromEntries(response.headers.entries()));
  return response.json();
})
.then(data => {
  console.log('Response data:', JSON.stringify(data, null, 2));
})
.catch(error => {
  console.error('Error:', error);
});

console.log('Sending request with data:', JSON.stringify(testData, null, 2));