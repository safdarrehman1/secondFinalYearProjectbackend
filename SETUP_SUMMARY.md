# 🎵 Music App Backend - Setup Summary

**Project Version**: 1.7.0  
**Date**: May 13, 2026  
**Status**: ✅ Dependencies Installed & Ready for Setup

---

## 📋 What Has Been Done

### ✅ Completed Tasks
1. **Dependencies Installed** (1,311 packages)
   - All npm packages successfully installed
   - Some deprecation warnings (normal, non-blocking)
   
2. **Environment File Created** (`.env`)
   - Copied from `.env.example`
   - Located at: `d:\finalYearProjectSecond\backend\.env`
   - All necessary configuration variables included

3. **Documentation Created**
   - `LOCAL_SETUP_GUIDE.md` - Comprehensive setup instructions
   - `QUICK_START.sh` - Unix/Linux/Mac quick start script
   - `QUICK_START.bat` - Windows quick start script
   - `Music_App_API_Collection.postman_collection.json` - Complete Postman collection

---

## 🚀 Next Steps to Run Locally

### Step 1: Start MongoDB
Choose one of these methods:

#### Option A: Windows Service (if MongoDB is installed)
```bash
# In Windows Command Prompt (run as Administrator)
net start MongoDB
# or
mongod
```

#### Option B: Docker (Recommended for quick setup)
```bash
docker run -d -p 27017:27017 --name mongodb mongo:latest
```

#### Option C: MongoDB Community Server
- Download from: https://www.mongodb.com/try/download/community
- Install and run as a service

### Step 2: Verify MongoDB Connection
```bash
# Test connection
mongosh --eval "db.adminCommand('ping')"
# or
mongo --eval "db.adminCommand('ping')"
```

### Step 3: Seed the Database
```bash
cd d:\finalYearProjectSecond\backend
node seed.js
```

**Expected Output:**
```
✅ Connected to MongoDB
✅ Users created: recruiter@example.com professional@example.com
✅ UserSpaces created
✅ Jobs created: 3
✅ Professional jobs created: 1
✅ Seeding completed successfully!
```

### Step 4: Start Development Server
```bash
npm run dev
```

**Expected Output:**
```
> musicapp@1.7.0 dev
> cross-env NODE_ENV=development nodemon src/index.js

[nodemon] watching for file changes...
Server is listening on port 5051
✅ Connected to MongoDB
```

### Step 5: Test the API
- **Swagger Docs**: http://localhost:5051/v1/docs
- **Backend URL**: http://localhost:5051

---

## 🔐 Test Credentials

### Pre-seeded Users
After running `node seed.js`, these accounts are created:

```
User 1: Recruiter
├─ Email: recruiter@example.com
├─ Password: password123
├─ Role: User
└─ Seller Metrics: 4.5 rating, 12 reviews, 20 orders

User 2: Professional
├─ Email: professional@example.com
├─ Password: password123
├─ Role: User
└─ Seller Metrics: 4.8 rating, 30 reviews, 45 orders
```

### Working Login Payloads
Use either of these in the frontend login form:

```json
{
   "email": "recruiter@example.com",
   "password": "password123"
}
```

```json
{
   "email": "professional@example.com",
   "password": "password123"
}
```

The login API also accepts `username`, `name`, or `identifier` instead of `email`.

If the frontend still shows an unexpected error, the usual causes are:
- the frontend is pointed at the wrong API base URL
- the backend process was not restarted after the login change
- the frontend is sending a different request body than expected

### First Login (Get Access Token)
```bash
POST http://localhost:5051/v1/auth/login
Content-Type: application/json

{
  "email": "recruiter@example.com",
  "password": "password123"
}
```

Response includes:
```json
{
  "user": { ... },
  "tokens": {
    "access": {
      "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "expires": "2026-05-13T10:30:00.000Z"
    },
    "refresh": {
      "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "expires": "2026-06-12T09:00:00.000Z"
    }
  }
}
```

---

## 📚 Postman Collection

A complete Postman collection has been created with all API endpoints:

**File**: `Music_App_API_Collection.postman_collection.json`

### How to Import:
1. Open Postman
2. Click **Import** → **Upload Files**
3. Select `Music_App_API_Collection.postman_collection.json`
4. All endpoints will be imported with proper formatting

### Collection Features:
- ✅ 50+ API endpoints organized by category
- ✅ Authentication endpoints with token management
- ✅ User operations (profile, billing, transactions)
- ✅ Job management (create, update, delete, apply)
- ✅ Music operations
- ✅ Chat system
- ✅ Order management
- ✅ Payment processing (Stripe, Square, PayPal)
- ✅ Blog, Gigs, Notifications, Reports
- ✅ All endpoints include example request bodies

### Environment Variables in Postman:
```
base_url      = http://localhost:5051/v1
access_token  = (copy from login response)
refresh_token = (copy from login response)
```

---

## 📁 Project Structure

```
d:\finalYearProjectSecond\backend\
├── src/
│   ├── app.js                 # Express app configuration
│   ├── index.js               # Entry point
│   ├── config/                # Configuration files
│   ├── controllers/           # Route handlers
│   ├── middlewares/           # Express middlewares
│   ├── models/                # Mongoose models
│   ├── routes/                # API routes
│   ├── services/              # Business logic
│   ├── utils/                 # Utility functions
│   ├── validations/           # Request validation schemas
│   └── docs/                  # Swagger documentation
├── package.json               # Dependencies & scripts
├── .env                       # Environment variables
├── seed.js                    # Database seeder
├── LOCAL_SETUP_GUIDE.md       # Detailed setup guide
├── QUICK_START.sh             # Unix quick start
├── QUICK_START.bat            # Windows quick start
└── Music_App_API_Collection.postman_collection.json
```

---

## 🛠️ Available Commands

```bash
# Development
npm run dev          # Start with auto-reload (port 5051)

# Production
npm start            # Start server

# Database
node seed.js         # Seed database with test data

# Validation
npm run lint         # Run ESLint

# Testing (if configured)
npm test             # Run tests
```

---

## 🌐 API Endpoints Summary

### Authentication
- `POST /auth/register` - Register new user
- `POST /auth/login` - Login user
- `POST /auth/logout` - Logout
- `POST /auth/refresh-tokens` - Refresh tokens
- `POST /auth/forgot-password` - Password reset request
- `POST /auth/reset-password` - Reset password

### Users
- `GET /users/me` - Get current user
- `GET /users/:userId` - Get user profile
- `PATCH /users/:userId` - Update user
- `POST /users/follow/:userId` - Follow user
- `DELETE /users/follow/:userId` - Unfollow user

### Jobs
- `GET /job` - Get all jobs
- `POST /job` - Create job
- `GET /job/:jobId` - Get job details
- `PATCH /job/:jobId` - Update job
- `DELETE /job/:jobId` - Delete job
- `POST /job/:jobId/apply` - Apply for job

### Music
- `GET /music` - Get all music
- `POST /music` - Create music
- `GET /music/:musicId` - Get music details
- `PATCH /music/:musicId` - Update music
- `DELETE /music/:musicId` - Delete music

### Orders
- `GET /order` - Get orders
- `POST /order` - Create order
- `PATCH /order/:orderId` - Update order

### Chat
- `GET /chat-system` - Get conversations
- `POST /chat-system` - Create conversation
- `POST /chat-system/:conversationId/messages` - Send message

### Payments
- `POST /stripe/create-intent` - Create Stripe payment
- `POST /square/pay` - Process Square payment
- `POST /paypal/create-order` - Create PayPal order

### More Endpoints
- Gigs, Blog, Notifications, Reports, User Space, etc.
- See `LOCAL_SETUP_GUIDE.md` for complete list

---

## 🐛 Troubleshooting

### MongoDB Connection Error
```
❌ Failed to connect to server [localhost:27017]
```
**Solution**: 
1. Check if MongoDB is running: `mongod --version`
2. Start MongoDB service
3. Verify connection: `mongo --eval "db.adminCommand('ping')"`

### Port 5051 Already in Use
```bash
# Windows - Find and kill process
netstat -ano | findstr :5051
taskkill /PID <PID> /F

# Mac/Linux
lsof -i :5051
kill -9 <PID>
```

### Dependencies Installation Failed
```bash
# Clear cache and reinstall
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

### Nodemon Not Restarting
```bash
# Check nodemon configuration
npm ls nodemon

# Manually restart server
# Press Ctrl+C and run: npm run dev
```

---

## 📊 Database Collections Created by Seeder

After running `node seed.js`, these collections are created:

1. **Users** (2 test users)
   - Recruiter account
   - Professional account

2. **UserSpaces** (2 profiles)
   - Recruiter profile
   - Professional profile

3. **Jobs** (4 job postings)
   - Brand identity project
   - Motion graphics project
   - UI/UX design project
   - Coffee brand logo project

4. **ShareMusicCreation** (2 portfolio works)
   - Brand identity portfolio
   - Motion graphics showreel

---

## 🔧 Environment Configuration

Key environment variables in `.env`:

```
# Server
NODE_ENV=development
PORT=5051
BASE_URL=http://localhost:5051

# Database
MONGODB_URL=mongodb://localhost:27017/modelstation

# JWT
JWT_SECRET=your-jwt-secret-key
JWT_ACCESS_EXPIRATION_MINUTES=30
JWT_REFRESH_EXPIRATION_DAYS=30

# Email
RESEND_API_KEY=re_xxxxxxxxxxxx
EMAIL_FROM=noreply@yourdomain.com

# Payment Services
STRIPE_SECRET_KEY=sk_test_xxxx
SQUARE_ENVIRONMENT=sandbox

# AI
GROQ_API_KEY=
GROQ_MODEL=mixtral-8x7b-32768
```

---

## 📖 Additional Resources

1. **API Documentation**: http://localhost:5051/v1/docs (when server running)
2. **Local Setup Guide**: `LOCAL_SETUP_GUIDE.md`
3. **Postman Collection**: `Music_App_API_Collection.postman_collection.json`
4. **MongoDB Docs**: https://docs.mongodb.com/
5. **Express.js Docs**: https://expressjs.com/

---

## ✨ What's Next?

1. ✅ Install dependencies
2. ✅ Setup environment file
3. ⏭️ **Start MongoDB**
4. ⏭️ **Run seed.js**
5. ⏭️ **Start development server** (`npm run dev`)
6. ⏭️ **Test API endpoints** using Postman collection
7. ⏭️ **Access Swagger docs** at http://localhost:5051/v1/docs

---

## 🎯 Quick Command Reference

```bash
# Full setup from scratch
cd d:\finalYearProjectSecond\backend
cp .env.example .env
npm install
node seed.js
npm run dev

# Or use quick start script (Windows)
QUICK_START.bat

# Or use quick start script (Mac/Linux)
./QUICK_START.sh
```

---

**Setup Complete! 🚀 You're ready to start developing.**

For any issues, check the troubleshooting section or refer to the detailed setup guide.
