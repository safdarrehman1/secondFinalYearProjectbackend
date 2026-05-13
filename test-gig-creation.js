// Test gig creation with minimal data
const testGigData = {
  title: "Test Gig",
  description: "Test description for the gig",
  category: "3D Design",
  packages: {
    basic: {
      title: "Basic Package",
      description: "Basic service package",
      price: 25,
      revisions: 1,
      features: []
    }
  },
  tags: [],
  videos: [],
  images: [],
  coverImageIndex: 0,
  status: "active",
  isActive: true
};

console.log('Test gig data:', JSON.stringify(testGigData, null, 2));

// Test the API call
fetch('http://localhost:3002/v1/gigs', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_TOKEN_HERE' // Replace with actual token
  },
  body: JSON.stringify(testGigData)
})
.then(response => {
  console.log('Response status:', response.status);
  return response.json();
})
.then(data => {
  console.log('Response data:', data);
})
.catch(error => {
  console.error('Error:', error);
});