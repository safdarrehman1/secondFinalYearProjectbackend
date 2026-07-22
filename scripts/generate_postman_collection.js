const fs = require('fs');
const path = require('path');

const baseUrl = "https://secondfinalyearprojectbackend-1.onrender.com/v1";

const postmanCollection = {
  info: {
    name: "Intelligent Hiring & Skills Gap Analysis API - Deployed Backend",
    description: "Complete production API Collection for Intelligent Hiring & Skills Gap Analysis Backend deployed at https://secondfinalyearprojectbackend-1.onrender.com\n\nEnvironment Variables:\n- baseUrl: https://secondfinalyearprojectbackend-1.onrender.com/v1\n- authToken: JWT Bearer Access Token",
    schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  variable: [
    {
      key: "baseUrl",
      value: "https://secondfinalyearprojectbackend-1.onrender.com/v1",
      type: "string"
    },
    {
      key: "authToken",
      value: "",
      type: "string"
    }
  ],
  auth: {
    type: "bearer",
    bearer: [
      {
        key: "token",
        value: "{{authToken}}",
        type: "string"
      }
    ]
  },
  item: [
    {
      name: "1. Authentication",
      item: [
        {
          name: "Register User",
          request: {
            method: "POST",
            header: [{ key: "Content-Type", value: "application/json" }],
            url: { raw: "{{baseUrl}}/auth/register", host: ["{{baseUrl}}"], path: ["auth", "register"] },
            body: {
              mode: "raw",
              raw: JSON.stringify({
                name: "John Doe",
                email: "johndoe@example.com",
                password: "Password123!"
              }, null, 2)
            }
          }
        },
        {
          name: "Login User",
          request: {
            method: "POST",
            header: [{ key: "Content-Type", value: "application/json" }],
            url: { raw: "{{baseUrl}}/auth/login", host: ["{{baseUrl}}"], path: ["auth", "login"] },
            body: {
              mode: "raw",
              raw: JSON.stringify({
                email: "johndoe@example.com",
                password: "Password123!"
              }, null, 2)
            }
          }
        },
        {
          name: "Refresh Tokens",
          request: {
            method: "POST",
            header: [{ key: "Content-Type", value: "application/json" }],
            url: { raw: "{{baseUrl}}/auth/refresh-tokens", host: ["{{baseUrl}}"], path: ["auth", "refresh-tokens"] },
            body: {
              mode: "raw",
              raw: JSON.stringify({
                refreshToken: "YOUR_REFRESH_TOKEN_HERE"
              }, null, 2)
            }
          }
        },
        {
          name: "Forgot Password",
          request: {
            method: "POST",
            header: [{ key: "Content-Type", value: "application/json" }],
            url: { raw: "{{baseUrl}}/auth/forgot-password", host: ["{{baseUrl}}"], path: ["auth", "forgot-password"] },
            body: {
              mode: "raw",
              raw: JSON.stringify({
                email: "johndoe@example.com"
              }, null, 2)
            }
          }
        },
        {
          name: "Logout User",
          request: {
            method: "POST",
            header: [{ key: "Content-Type", value: "application/json" }],
            url: { raw: "{{baseUrl}}/auth/logout", host: ["{{baseUrl}}"], path: ["auth", "logout"] },
            body: {
              mode: "raw",
              raw: JSON.stringify({
                refreshToken: "YOUR_REFRESH_TOKEN_HERE"
              }, null, 2)
            }
          }
        }
      ]
    },
    {
      name: "2. Hiring Assets & Cart",
      item: [
        {
          name: "Get All Hiring Assets",
          request: {
            method: "GET",
            url: { raw: "{{baseUrl}}/hiring-asset", host: ["{{baseUrl}}"], path: ["hiring-asset"] }
          }
        },
        {
          name: "Create Hiring Asset",
          request: {
            method: "POST",
            header: [{ key: "Content-Type", value: "application/json" }],
            url: { raw: "{{baseUrl}}/hiring-asset", host: ["{{baseUrl}}"], path: ["hiring-asset"] },
            body: {
              mode: "raw",
              raw: JSON.stringify({
                title: "E-Commerce Professional Web Application",
                category: "Web Development",
                subcategory: "Fullstack",
                description: "Complete fullstack e-commerce project template with payment integration",
                personalLicensePrice: 29,
                commercialLicensePrice: 79,
                uploadAsset: { url: "https://example.com/asset.zip" }
              }, null, 2)
            }
          }
        },
        {
          name: "Get My Created Assets",
          request: {
            method: "GET",
            url: { raw: "{{baseUrl}}/hiring-asset/my-assets", host: ["{{baseUrl}}"], path: ["hiring-asset", "my-assets"] }
          }
        },
        {
          name: "Get Asset By ID",
          request: {
            method: "GET",
            url: { raw: "{{baseUrl}}/hiring-asset/:assetId", host: ["{{baseUrl}}"], path: ["hiring-asset", ":assetId"], variable: [{ key: "assetId", value: "ASSET_ID_HERE" }] }
          }
        },
        {
          name: "Add Asset to Cart",
          request: {
            method: "POST",
            url: { raw: "{{baseUrl}}/hiring-asset/cart/:assetId", host: ["{{baseUrl}}"], path: ["hiring-asset", "cart", ":assetId"], variable: [{ key: "assetId", value: "ASSET_ID_HERE" }] }
          }
        },
        {
          name: "Get User Shopping Cart",
          request: {
            method: "GET",
            url: { raw: "{{baseUrl}}/hiring-asset/my/cart", host: ["{{baseUrl}}"], path: ["hiring-asset", "my", "cart"] }
          }
        },
        {
          name: "Delete Item from Cart",
          request: {
            method: "DELETE",
            url: { raw: "{{baseUrl}}/hiring-asset/delete/cart/:assetId", host: ["{{baseUrl}}"], path: ["hiring-asset", "delete", "cart", ":assetId"], variable: [{ key: "assetId", value: "ASSET_ID_HERE" }] }
          }
        },
        {
          name: "Clear Shopping Cart",
          request: {
            method: "DELETE",
            url: { raw: "{{baseUrl}}/hiring-asset/clear/cart", host: ["{{baseUrl}}"], path: ["hiring-asset", "clear", "cart"] }
          }
        },
        {
          name: "Add Sale / Complete Payment",
          request: {
            method: "POST",
            header: [{ key: "Content-Type", value: "application/json" }],
            url: { raw: "{{baseUrl}}/hiring-asset/add/sale", host: ["{{baseUrl}}"], path: ["hiring-asset", "add", "sale"] },
            body: {
              mode: "raw",
              raw: JSON.stringify({
                saleData: {
                  assetId: "ASSET_ID_HERE",
                  quantity: 1,
                  OwnerId: "SELLER_USER_ID_HERE",
                  assetPrice: 79,
                  assetTitle: "E-Commerce Professional Web Application",
                  buyer: "John Buyer",
                  creatorName: "John Creator",
                  paymentMethod: "simulated_fake_payment",
                  paymentId: "MOCK_PAYMENT_1700000000000",
                  licenseType: "Commercial License"
                }
              }, null, 2)
            }
          }
        },
        {
          name: "Get Sales List (Seller/Buyer)",
          request: {
            method: "GET",
            url: { raw: "{{baseUrl}}/hiring-asset/get/sales", host: ["{{baseUrl}}"], path: ["hiring-asset", "get", "sales"] }
          }
        }
      ]
    },
    {
      name: "3. Purchases & Sales History",
      item: [
        {
          name: "Get Buyer Purchase History",
          request: {
            method: "GET",
            url: { raw: "{{baseUrl}}/purchases/history?limit=10&page=1", host: ["{{baseUrl}}"], path: ["purchases", "history"], query: [{ key: "limit", value: "10" }, { key: "page", value: "1" }] }
          }
        },
        {
          name: "Get Single Purchase Details",
          request: {
            method: "GET",
            url: { raw: "{{baseUrl}}/purchases/history/:purchaseId", host: ["{{baseUrl}}"], path: ["purchases", "history", ":purchaseId"], variable: [{ key: "purchaseId", value: "PURCHASE_ID_HERE" }] }
          }
        },
        {
          name: "Get Creator Sales Data",
          request: {
            method: "GET",
            url: { raw: "{{baseUrl}}/purchases/sales?limit=10&page=1", host: ["{{baseUrl}}"], path: ["purchases", "sales"], query: [{ key: "limit", value: "10" }, { key: "page", value: "1" }] }
          }
        },
        {
          name: "Create Sponsorship Payment",
          request: {
            method: "POST",
            header: [{ key: "Content-Type", value: "application/json" }],
            url: { raw: "{{baseUrl}}/purchases/sponsor", host: ["{{baseUrl}}"], path: ["purchases", "sponsor"] },
            body: {
              mode: "raw",
              raw: JSON.stringify({
                amount: 50,
                baseAmount: 50,
                currency: "USD",
                paymentId: "PAYPAL_ORDER_ID_HERE",
                creatorId: "CREATOR_USER_ID_HERE"
              }, null, 2)
            }
          }
        }
      ]
    },
    {
      name: "4. Jobs & Recruitment",
      item: [
        {
          name: "Get All Jobs",
          request: {
            method: "GET",
            url: { raw: "{{baseUrl}}/job", host: ["{{baseUrl}}"], path: ["job"] }
          }
        },
        {
          name: "Create New Job Post",
          request: {
            method: "POST",
            header: [{ key: "Content-Type", value: "application/json" }],
            url: { raw: "{{baseUrl}}/job", host: ["{{baseUrl}}"], path: ["job"] },
            body: {
              mode: "raw",
              raw: JSON.stringify({
                title: "Senior Full Stack Engineer",
                jobType: "Full-Time",
                location: "Remote",
                salaryRange: "$90,000 - $120,000",
                description: "We are looking for an experienced Full Stack developer with Next.js and Node.js expertise.",
                requiredSkills: ["Next.js", "Node.js", "MongoDB", "TypeScript"]
              }, null, 2)
            }
          }
        },
        {
          name: "Get Job By ID",
          request: {
            method: "GET",
            url: { raw: "{{baseUrl}}/job/:jobId", host: ["{{baseUrl}}"], path: ["job", ":jobId"], variable: [{ key: "jobId", value: "JOB_ID_HERE" }] }
          }
        },
        {
          name: "Get Applicants for Job",
          request: {
            method: "GET",
            url: { raw: "{{baseUrl}}/jobs/:jobId/applicants", host: ["{{baseUrl}}"], path: ["jobs", ":jobId", "applicants"], variable: [{ key: "jobId", value: "JOB_ID_HERE" }] }
          }
        }
      ]
    },
    {
      name: "5. Freelance Gigs & Services",
      item: [
        {
          name: "Browse Gigs",
          request: {
            method: "GET",
            url: { raw: "{{baseUrl}}/gigs", host: ["{{baseUrl}}"], path: ["gigs"] }
          }
        },
        {
          name: "Create Gig",
          request: {
            method: "POST",
            header: [{ key: "Content-Type", value: "application/json" }],
            url: { raw: "{{baseUrl}}/gigs", host: ["{{baseUrl}}"], path: ["gigs"] },
            body: {
              mode: "raw",
              raw: JSON.stringify({
                title: "I will build a modern React / Next.js web application",
                category: "Programming & Tech",
                packages: {
                  basic: { title: "Basic Web Page", price: 50, deliveryTime: 3 },
                  standard: { title: "Full App", price: 150, deliveryTime: 5 },
                  premium: { title: "Enterprise Solution", price: 300, deliveryTime: 7 }
                }
              }, null, 2)
            }
          }
        },
        {
          name: "Get Gig Details",
          request: {
            method: "GET",
            url: { raw: "{{baseUrl}}/gigs/:gigId", host: ["{{baseUrl}}"], path: ["gigs", ":gigId"], variable: [{ key: "gigId", value: "GIG_ID_HERE" }] }
          }
        }
      ]
    },
    {
      name: "6. User Management & Profiles",
      item: [
        {
          name: "Get Current Authenticated User",
          request: {
            method: "GET",
            url: { raw: "{{baseUrl}}/users/me", host: ["{{baseUrl}}"], path: ["users", "me"] }
          }
        },
        {
          name: "Get Users List",
          request: {
            method: "GET",
            url: { raw: "{{baseUrl}}/users", host: ["{{baseUrl}}"], path: ["users"] }
          }
        },
        {
          name: "Update User Profile",
          request: {
            method: "PATCH",
            header: [{ key: "Content-Type", value: "application/json" }],
            url: { raw: "{{baseUrl}}/users/:userId", host: ["{{baseUrl}}"], path: ["users", ":userId"], variable: [{ key: "userId", value: "USER_ID_HERE" }] },
            body: {
              mode: "raw",
              raw: JSON.stringify({
                name: "John Updated",
                bio: "Full Stack Developer & Technical Architect"
              }, null, 2)
            }
          }
        },
        {
          name: "Get User Spaces",
          request: {
            method: "GET",
            url: { raw: "{{baseUrl}}/user-space", host: ["{{baseUrl}}"], path: ["user-space"] }
          }
        }
      ]
    },
    {
      name: "7. Chat & Messaging",
      item: [
        {
          name: "Get Conversations",
          request: {
            method: "GET",
            url: { raw: "{{baseUrl}}/chat-system/conversations", host: ["{{baseUrl}}"], path: ["chat-system", "conversations"] }
          }
        },
        {
          name: "Send Message",
          request: {
            method: "POST",
            header: [{ key: "Content-Type", value: "application/json" }],
            url: { raw: "{{baseUrl}}/chat-system/message", host: ["{{baseUrl}}"], path: ["chat-system", "message"] },
            body: {
              mode: "raw",
              raw: JSON.stringify({
                receiverId: "RECIPIENT_USER_ID_HERE",
                content: "Hello! I am interested in discussing this project opportunity."
              }, null, 2)
            }
          }
        },
        {
          name: "Get Messages in Chat",
          request: {
            method: "GET",
            url: { raw: "{{baseUrl}}/chat-system/messages/:chatId", host: ["{{baseUrl}}"], path: ["chat-system", "messages", ":chatId"], variable: [{ key: "chatId", value: "CHAT_ID_HERE" }] }
          }
        }
      ]
    },
    {
      name: "8. File Uploads & Resumes",
      item: [
        {
          name: "Get Resumes",
          request: {
            method: "GET",
            url: { raw: "{{baseUrl}}/resumes", host: ["{{baseUrl}}"], path: ["resumes"] }
          }
        },
        {
          name: "Upload File / Attachment",
          request: {
            method: "POST",
            url: { raw: "{{baseUrl}}/upload", host: ["{{baseUrl}}"], path: ["upload"] }
          }
        }
      ]
    }
  ]
};

const outputPath = path.join(__dirname, '..', '..', 'Intelligent_Hiring_API_Collection.postman_collection.json');
fs.writeFileSync(outputPath, JSON.stringify(postmanCollection, null, 2), 'utf8');
console.log(`✅ Postman Collection created successfully at: ${outputPath}`);
