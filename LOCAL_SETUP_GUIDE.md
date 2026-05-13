# Local Setup Guide - Music App Backend

## Prerequisites
- Node.js >= 18.0.0 (currently installed: v24.11.1)
- npm or pnpm
- MongoDB 4.0+
- Git

## Step 1: Install Dependencies ✅
Dependencies have been installed successfully. Total packages: 1,311

```bash
cd backend
npm install
# or
pnpm install
```

## Step 2: Environment Configuration ✅
The `.env` file has been created from `.env.example`. Located at: `backend/.env`

### Important Environment Variables:
```
# App
NODE_ENV=development
PORT=5051
BASE_URL=http://localhost:5051
BACKEND_URL=http://localhost:5051
FRONTEND_URL=http://localhost:3000

# Database
MONGODB_URL=mongodb://localhost:27017/modelstation

# JWT
JWT_SECRET=your-jwt-secret-key
JWT_ACCESS_EXPIRATION_MINUTES=30
JWT_REFRESH_EXPIRATION_DAYS=30

# Email & Auth
RESEND_API_KEY=re_xxxxxxxxxxxx
EMAIL_FROM=noreply@yourdomain.com
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=password123

# Payment Services
STRIPE_PUBLISHABLE_KEY=pk_test_xxxx
STRIPE_SECRET_KEY=sk_test_xxxx
SQUARE_ENVIRONMENT=sandbox

# AI
GROQ_API_KEY=
GROQ_MODEL=mixtral-8x7b-32768
```

## Step 3: Setup MongoDB Locally

### On Windows (using MongoDB Community Edition):

#### Option A: MongoDB Community Server
1. Download from: https://www.mongodb.com/try/download/community
2. Install with default settings
3. MongoDB will run as a Windows service automatically
4. Verify installation:
```bash
mongod --version
```

#### Option B: MongoDB Docker Container
```bash
# Install Docker first, then:
docker run -d -p 27017:27017 --name mongodb -e MONGO_INITDB_ROOT_USERNAME=admin -e MONGO_INITDB_ROOT_PASSWORD=password mongo:latest

# Access MongoDB:
docker exec -it mongodb mongosh -u admin -p password
```

#### Option C: Check if MongoDB is running
```bash
# Windows - Check if MongoDB service is running
tasklist | find "mongod"

# Or check MongoDB connection
mongosh --eval "db.adminCommand('ping')"
```

## Step 4: Seed the Database

Once MongoDB is running and connected to `mongodb://localhost:27017/modelstation`:

```bash
node seed.js
```

### Seeded Test Data:
- **Test Users**:
  - Email: `recruiter@example.com` | Password: `password123`
  - Email: `professional@example.com` | Password: `password123`
  
- **Jobs Created**: 3 sample jobs with different categories
- **User Spaces**: Professional profiles and portfolios
- **Portfolio Works**: Sample design and motion graphics projects

## Step 5: Run the Development Server

```bash
npm run dev
# or
pnpm dev
```

Expected output:
```
> musicapp@1.7.0 dev
> cross-env NODE_ENV=development nodemon src/index.js

[nodemon] watching for file changes...
Server is listening on port 5051
✅ Connected to MongoDB
```

### Available Commands:
```bash
npm run start        # Production mode
npm run dev          # Development mode (with auto-reload)
npm run test         # Run tests (if configured)
npm run lint         # Run ESLint
```

## Step 6: Access the Application

- **Backend API**: http://localhost:5051
- **API Docs**: http://localhost:5051/v1/docs
- **Health Check**: http://localhost:5051/v1/health

## Test Authentication Flow

### 1. Login as recruiter:
```bash
POST http://localhost:5051/v1/auth/login
Content-Type: application/json

{
  "email": "recruiter@example.com",
  "password": "password123"
}
```

### 2. Login as professional:
```bash
POST http://localhost:5051/v1/auth/login
Content-Type: application/json

{
  "email": "professional@example.com",
  "password": "password123"
}
```

### 3. Register a new user:
```bash
POST http://localhost:5051/v1/auth/register
Content-Type: application/json

{
  "name": "Test User",
  "email": "test@example.com",
  "password": "TestPass123"
}
```

### 4. Login field flexibility:
The login API accepts `email`, `username`, `name`, or `identifier` for the first field.

### 4b. If you still see "unexpected error"
1. Make sure the frontend is calling `POST /v1/auth/login` on the current backend URL.
2. Restart the backend after code changes so the updated login handler is loaded.
3. Use one of the seeded accounts below exactly as written.

### 5. Login:
```bash
POST http://localhost:5051/v1/auth/login
Content-Type: application/json

{
  "email": "test@example.com",
  "password": "TestPass123"
}
```

### 3. Use the access token in subsequent requests:
```bash
GET http://localhost:5051/v1/users/me
Authorization: Bearer <your-access-token>
```

## Available API Routes

### Authentication (`/v1/auth/`)
- `POST /register` - Register new user
- `POST /login` - Login user
- `POST /logout` - Logout user
- `POST /refresh-tokens` - Refresh authentication tokens
- `POST /forgot-password` - Request password reset
- `POST /reset-password` - Reset password
- `POST /send-verification-email` - Resend verification email
- `GET /verify-email` - Verify email token
- `POST /change-password` - Change password
- `POST /google-register` - Google authentication

### Users (`/v1/users/`)
- `GET /` - Get all users (admin)
- `POST /` - Create user (admin)
- `GET /me` - Get current user
- `GET /me/billing` - Get billing info
- `GET /me/balance` - Get wallet balance
- `GET /me/transactions` - Get transaction history
- `PATCH /:userId` - Update user (admin)
- `DELETE /:userId` - Delete user (admin)
- `POST /follow/:userId` - Follow user
- `DELETE /follow/:userId` - Unfollow user
- `GET /admin/all` - Get all users (admin)

### Music (`/v1/music/`)
- `GET /` - Get all music
- `POST /` - Create music
- `GET /:musicId` - Get music details
- `PATCH /:musicId` - Update music
- `DELETE /:musicId` - Delete music

### User Space (`/v1/user-space/`)
- `GET /` - Get user spaces
- `POST /` - Create user space
- `GET /:spaceId` - Get space details
- `PATCH /:spaceId` - Update space

### Jobs (`/v1/job/`)
- `GET /` - Get all jobs
- `POST /` - Create job
- `GET /:jobId` - Get job details
- `PATCH /:jobId` - Update job
- `DELETE /:jobId` - Delete job
- `POST /:jobId/apply` - Apply for job

### Orders (`/v1/order/`)
- `GET /` - Get all orders
- `POST /` - Create order
- `GET /:orderId` - Get order details
- `PATCH /:orderId` - Update order status

### Payment Methods
- **Stripe** (`/v1/stripe/`)
  - `POST /create-intent` - Create payment intent
  - `POST /webhook` - Handle Stripe webhooks

- **Square** (`/v1/square/`)
  - `POST /pay` - Process Square payment
  - `GET /callback` - OAuth callback

- **PayPal** (`/v1/paypal/`)
  - `POST /create-order` - Create PayPal order
  - `POST /capture-order` - Capture PayPal order

### Chat (`/v1/chat-system/`)
- `GET /` - Get all conversations
- `POST /` - Create conversation
- `GET /:conversationId` - Get conversation
- `POST /:conversationId/messages` - Send message

### Notifications (`/v1/notifications/`)
- `GET /` - Get notifications
- `PATCH /:notificationId` - Mark as read

### Reports (`/v1/reports/`)
- `GET /` - Get all reports
- `POST /` - Create report
- `GET /:reportId` - Get report details

### Gigs (`/v1/gigs/`)
- `GET /` - Get all gigs
- `POST /` - Create gig
- `GET /:gigId` - Get gig details
- `PATCH /:gigId` - Update gig

### Blog (`/v1/blog/`)
- `GET /` - Get all blog posts
- `POST /` - Create post
- `GET /:postId` - Get post
- `PATCH /:postId` - Update post

### Music Creation/Assets (`/v1/music-creation/`, `/v1/music-asset/`)
- `GET /` - Get creations/assets
- `POST /` - Create work
- `GET /:id` - Get details
- `PATCH /:id` - Update work

## Troubleshooting

### MongoDB Connection Error
```
❌ Failed to connect to server [localhost:27017]
```
**Solution**: 
1. Ensure MongoDB is installed and running
2. Check if port 27017 is available
3. Verify MONGODB_URL in .env file

### Port 5051 Already in Use
```bash
# Find process using port 5051
lsof -i :5051  # macOS/Linux
netstat -ano | findstr :5051  # Windows

# Kill the process
kill -9 <PID>  # macOS/Linux
taskkill /PID <PID> /F  # Windows
```

### Dependencies Installation Issues
```bash
# Clear npm cache and reinstall
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

### Email Service Not Working
- Ensure `RESEND_API_KEY` is set in .env
- For development, emails are logged to console

## Production Deployment

### Environment Setup:
1. Set `NODE_ENV=production`
2. Use production database URL
3. Set strong `JWT_SECRET`
4. Configure all payment service credentials
5. Set up proper error logging

### Using PM2 for Process Management:
```bash
npm install -g pm2
pm2 start src/index.js --name "music-app"
pm2 logs music-app
pm2 stop music-app
```

### Docker Deployment:
```bash
docker build -t music-app-backend .
docker run -p 5051:5051 --env-file .env music-app-backend
```

## API Documentation

Swagger API documentation is available at:
```
http://localhost:5051/v1/docs
```

## Support

For issues or questions:
1. Check the API documentation at `/v1/docs`
2. Review error logs in the console
3. Check database connectivity
4. Verify all environment variables are set correctly

---
**Version**: 1.7.0
**Last Updated**: May 13, 2026
