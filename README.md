# Intelligent Hiring & Skills Gap Analysis — REST API Backend ⚙️

![Node.js](https://img.shields.io/badge/Node.js-20.x-339933.svg?style=flat&logo=nodedotjs)
![Express](https://img.shields.io/badge/Express-4.18.2-000000.svg?style=flat&logo=express)
![MongoDB](https://img.shields.io/badge/MongoDB-Mongoose-47A248.svg?style=flat&logo=mongodb)
![Swagger](https://img.shields.io/badge/Swagger-API_Docs-85EA2D.svg?style=flat&logo=swagger)
![Deployment](https://img.shields.io/badge/Deployed-Render-46E3B7.svg?style=flat&logo=render)

---

## 🌐 Production Server Information

* **Live Deployed API Base URL**: `https://secondfinalyearprojectbackend-1.onrender.com/v1`
* **Health Check Endpoint**: `https://secondfinalyearprojectbackend-1.onrender.com/v1/auth/login`
* **Postman Collection**: `Intelligent_Hiring_API_Collection.postman_collection.json`

---

## 📌 Architectural Overview

The **Intelligent Hiring Backend** is a scalable, modular Node.js & Express RESTful API server. It manages authentication, candidate screening pipelines, digital asset e-commerce transactions, real-time messaging, and multi-gateway payment processing.

```
                  ┌───────────────────────────────────────────────┐
                  │              Next.js 15 Client                │
                  └───────────────────────┬───────────────────────┘
                                          │ HTTP REST / WebSockets
                                          ▼
                  ┌───────────────────────────────────────────────┐
                  │    Render Node.js API (Express Framework)     │
                  ├───────────────────────┬───────────────────────┤
                  │  JWT Authentication   │  Validation (Joi)     │
                  │  Passport / Security  │  Winston Logger       │
                  └───────────┬───────────┴───────────┬───────────┘
                              │                       │
                              ▼                       ▼
                   ┌───────────────────┐    ┌───────────────────┐
                   │ MongoDB Atlas DB  │    ┌ Socket.io Engine  │
                   └───────────────────┘    └───────────────────┘
```

---

## 🌟 Backend Modules & Feature Breakdown

### 1. 🔐 Auth & Identity Management (`/v1/auth`, `/v1/users`)
* **JWT Access & Refresh Token Pairs**: Secure authentication header authentication via Bearer tokens.
* **Email Verification & Password Recovery**: OTP & token-based password reset flows.
* **Role-Based Access Control (RBAC)**: Enforced via `auth('user')` and `auth('admin')` middleware.

### 2. 🛒 Marketplace & Cart Engine (`/v1/hiring-asset`)
* **Asset Catalog**: Full CRUD for digital assets, source code, and project files.
* **Cart Operations**: Atomic database cart management (`addToCart`, `removeFromCart`, `clearCart`).
* **Instant Sale Completion (`addSale`)**: Dual-record transaction creation:
  - Generates a `Sale` document (for seller earnings tracking).
  - Generates a `Purchase` document (for buyer purchase history).
  - Automatically empties the user's database shopping cart upon checkout completion.

### 3. 📊 Sales & Purchase Service (`/v1/purchases`)
* **Buyer Purchase History (`/v1/purchases/history`)**: Unified, deduplicated endpoint querying both `Purchase` and `Sale` collections sorted by transaction timestamp.
* **Seller Earnings Aggregation (`/v1/purchases/sales`)**: Calculates total revenue, completed deal count, and sales statistics per creator.

### 4. 💼 Jobs, Screening & Applicant Pipelines (`/v1/job`, `/v1/applications`)
* **Job Board API**: Filterable job listing, detail retrieval, and posting management.
* **AI Candidate Screening**: Applicant skill matching algorithms for talent recruitment.

### 5. 💬 WebSockets Real-Time Messaging (`/v1/chat-system`)
* **Socket.io Integration**: Live room joining, direct messaging, and online status notifications.

---

## 🛠 Technology Stack & Libraries

| Technology | Purpose |
|---|---|
| **Node.js (v20+)** | JavaScript Runtime Environment |
| **Express.js** | Web Application Framework |
| **MongoDB / Mongoose** | NoSQL Database & Schema Object Modeling |
| **Passport.js & JWT** | Token Authentication Strategy |
| **Joi** | Request Validation Schemas |
| **Winston & Morgan** | Application Logging & HTTP Request Loggers |
| **Socket.io** | Real-Time Bi-Directional WebSockets |
| **Helmet & CORS** | HTTP Security Headers & Origin Management |

---

## 🚀 API Endpoint Reference

| Module | Method | Endpoint | Description | Auth Required |
|---|---|---|---|:---:|
| **Auth** | `POST` | `/v1/auth/register` | Register new user account | ❌ |
| **Auth** | `POST` | `/v1/auth/login` | Login & receive token pair | ❌ |
| **Auth** | `POST` | `/v1/auth/refresh-tokens` | Refresh expired access token | ❌ |
| **Assets** | `GET` | `/v1/hiring-asset` | Get all marketplace assets | ❌ |
| **Assets** | `POST` | `/v1/hiring-asset` | Create new hiring asset | ✅ |
| **Cart** | `POST` | `/v1/hiring-asset/cart/:assetId` | Add asset to user cart | ✅ |
| **Cart** | `GET` | `/v1/hiring-asset/my/cart` | Get current user cart | ✅ |
| **Cart** | `DELETE` | `/v1/hiring-asset/clear/cart` | Clear user cart | ✅ |
| **Sale** | `POST` | `/v1/hiring-asset/add/sale` | Process sale & complete payment | ✅ |
| **Purchases**| `GET` | `/v1/purchases/history` | Get buyer purchase history | ✅ |
| **Sales** | `GET` | `/v1/purchases/sales` | Get creator sales dashboard data | ✅ |
| **Jobs** | `GET` | `/v1/job` | Get job postings | ❌ |
| **Jobs** | `POST` | `/v1/job` | Post a new job opportunity | ✅ |
| **Chats** | `GET` | `/v1/chat-system/conversations` | Get active user chat threads | ✅ |
| **Upload** | `POST` | `/v1/upload` | Upload file / media attachment | ✅ |

---

## ⚙️ Environment Variables Setup

Create a `.env` file in the `backend` root directory:

```env
# Server Port & Node Environment
PORT=5051
NODE_ENV=production

# MongoDB Database Connection URL
MONGODB_URL=mongodb+srv://<username>:<password>@cluster.mongodb.net/intelligent_hiring

# JWT Configuration
JWT_SECRET=your_super_secret_jwt_key_here
JWT_ACCESS_EXPIRATION_MINUTES=43200
JWT_REFRESH_EXPIRATION_DAYS=30

# CORS Allowed Origins
CORS_ORIGIN=https://intelligenthiring.com,http://localhost:3000

# Payment Gateway Configs (Optional)
PAYPAL_CLIENT_ID=your_paypal_client_id
PAYPAL_SECRET=your_paypal_secret
STRIPE_SECRET_KEY=your_stripe_secret_key
```

---

## 💻 Local Installation & Setup

```bash
# 1. Clone repository
git clone https://github.com/safdarrehman1/secondFinalYearProjectbackend.git
cd secondFinalYearProjectbackend/backend

# 2. Install dependencies
npm install

# 3. Start development server
npm run dev

# 4. Run automated tests
npm test
```

---

## 📬 Postman Collection

Import the included Postman Collection to immediately test deployed endpoints:
* **File Location**: `../Intelligent_Hiring_API_Collection.postman_collection.json`
* **Base URL**: `https://secondfinalyearprojectbackend-1.onrender.com/v1`

---

## 📄 License

Copyright © 2026 Intelligent Hiring Team. All rights reserved.
