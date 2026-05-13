/**
 * Seeder - Data dummy untuk development
 * Jalankan: node seed.js
 */

const dotenv = require("dotenv");
const path = require("path");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

dotenv.config({ path: path.join(__dirname, ".env") });

const MONGODB_URL =
  process.env.MONGODB_URL ||
  "mongodb+srv://safdarmehsud123_db_user:BkBUgdSY3RMWd47R@cluster0.ml9k9z7.mongodb.net/modelstation?retryWrites=true&w=majority";

// ─── Connect ────────────────────────────────────────────────────────────────
async function connect() {
  await mongoose.connect(MONGODB_URL);
  console.log("✅ Connected to MongoDB");
}

// ─── Inline Schemas (bypass config validation) ──────────────────────────────
const { Schema } = mongoose;

const userSchema = new Schema(
  {
    name: String,
    email: { type: String, unique: true, lowercase: true },
    password: String,
    role: { type: String, default: "user" },
    isEmailVerified: { type: Boolean, default: true },
    profilePicture: { type: String, default: "" },
    isActive: { type: Boolean, default: true },
    accountStatus: { type: String, default: "active" },
    sellerMetrics: { averageRating: Number, totalReviews: Number, totalOrders: Number },
    buyerMetrics: { averageRating: Number, totalOrders: Number },
  },
  { timestamps: true }
);
const User = mongoose.models.User || mongoose.model("User", userSchema);

const userSpaceSchema = new Schema(
  {
    firstName: String,
    lastName: String,
    isClient: { type: Boolean, default: false },
    creationOccupation: [String],
    businessOccupation: String,
    address: String,
    aboutMe: String,
    profilePicture: String,
    coverUrl: String,
    myServices: [String],
    softwareTool: [String],
    createdBy: String,
    updatedBy: String,
  },
  { timestamps: true }
);
const UserSpace =
  mongoose.models.UserSpace || mongoose.model("UserSpace", userSpaceSchema);

const jobSchema = new Schema(
  {
    projectTitle: String,
    status: { type: String, default: "active" },
    activePeriod: { type: Number, default: 30 },
    expiresAt: Date,
    category: [String],
    budget: String,
    timeFrame: String,
    description: String,
    jobType: [String],
    createdBy: String,
  },
  { timestamps: true }
);
const Job = mongoose.models.Job || mongoose.model("Job", jobSchema);

const shareMusicCreationSchema = new Schema(
  {
    workType: { type: String, default: "design" },
    title: String,
    description: String,
    tags: [String],
    workImages: [String],
    category: String,
    subcategory: String,
    status: { type: String, default: "active" },
    createdBy: String,
    updatedBy: String,
    views: [],
    likes: [],
    comments: [],
  },
  { timestamps: true }
);
const ShareMusicCreation =
  mongoose.models.ShareMusicCreation ||
  mongoose.model("ShareMusicCreation", shareMusicCreationSchema);

const chatSchema = new Schema(
  {
    participants: [{ type: Schema.Types.ObjectId, ref: "User" }],
    type: { type: String, enum: ["direct", "job_application"], default: "direct" },
    jobId: { type: Schema.Types.ObjectId, ref: "Job" },
    inquiry: { type: Boolean, default: false },
    isRead: [{ type: Schema.Types.ObjectId, ref: "User" }],
    messages: [
      {
        sender: { type: Schema.Types.ObjectId, ref: "User" },
        text: String,
        isCard: { type: Boolean, default: false },
        cardData: { type: Schema.Types.Mixed, default: null },
        createdAt: { type: Date, default: Date.now },
        readby: { type: Boolean, default: false },
        attachments: [],
      },
    ],
    deletedBy: [{ type: Schema.Types.ObjectId, ref: "User", default: [] }],
    states: [
      {
        user: { type: Schema.Types.ObjectId, ref: "User" },
        status: { type: String, enum: ["inbox", "archive", "shortlist", "deleted"], default: "inbox" },
      },
    ],
  },
  { timestamps: true }
);
const Chat = mongoose.models.Chat || mongoose.model("Chat", chatSchema);

const appliedJobSchema = new Schema(
  {
    musicIds: [{ type: Schema.Types.ObjectId, ref: "Music" }],
    message: { type: String, required: true },
    jobId: { type: Schema.Types.ObjectId, ref: "Job", required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);
const AppliedJobs = mongoose.models.AppliedJobs || mongoose.model("AppliedJobs", appliedJobSchema);

// ─── Seed ────────────────────────────────────────────────────────────────────
async function seed() {
  // Clear existing seed data
  await User.deleteMany({ email: { $in: ["recruiter@example.com", "professional@example.com"] } });

  const hashedPass = await bcrypt.hash("password123", 8);

  // ── Users ──
  const recruiter = await User.create({
    name: "Alex Recruiter",
    email: "recruiter@example.com",
    password: hashedPass,
    role: "user",
    isEmailVerified: true,
    profilePicture: "https://i.pravatar.cc/150?img=11",
    sellerMetrics: { averageRating: 4.5, totalReviews: 12, totalOrders: 20 },
    buyerMetrics: { averageRating: 4.2, totalOrders: 8 },
  });

  const professional = await User.create({
    name: "Maya Professional",
    email: "professional@example.com",
    password: hashedPass,
    role: "user",
    isEmailVerified: true,
    profilePicture: "https://i.pravatar.cc/150?img=47",
    sellerMetrics: { averageRating: 4.8, totalReviews: 30, totalOrders: 45 },
    buyerMetrics: { averageRating: 4.6, totalOrders: 5 },
  });

  console.log("✅ Users created:", recruiter.email, professional.email);

  // ── UserSpaces ──
  await UserSpace.deleteMany({ createdBy: { $in: [recruiter.id, professional.id] } });

  await UserSpace.create({
    firstName: "Alex",
    lastName: "Recruiter",
    isClient: true,
    creationOccupation: ["Film Director", "Producer"],
    businessOccupation: "Film Director",
    address: "Los Angeles, CA",
    aboutMe: "Looking for talented creatives for my film and design projects.",
    profilePicture: "https://i.pravatar.cc/150?img=11",
    coverUrl: "https://images.unsplash.com/photo-1485846234645-a62644f84728?w=800",
    myServices: ["Film Production", "Casting"],
    createdBy: recruiter.id,
    updatedBy: recruiter.id,
  });

  await UserSpace.create({
    firstName: "Maya",
    lastName: "Professional",
    isClient: false,
    creationOccupation: ["Graphic Designer", "Motion Designer"],
    address: "New York, NY",
    aboutMe: "Passionate designer with 5+ years of experience in branding and visual identity.",
    profilePicture: "https://i.pravatar.cc/150?img=47",
    coverUrl: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800",
    myServices: ["Logo Design", "Brand Identity", "Motion Graphics"],
    softwareTool: ["Adobe Illustrator", "Figma", "After Effects"],
    createdBy: professional.id,
    updatedBy: professional.id,
  });

  console.log("✅ UserSpaces created");

  // ── Jobs ──
  await Job.deleteMany({ createdBy: recruiter.id });

  const now = new Date();
  const jobs = await Job.insertMany([
    {
      projectTitle: "Brand Identity for Tech Startup",
      status: "active",
      activePeriod: 30,
      expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
      category: ["Design", "Branding"],
      budget: "$500 - $1000",
      timeFrame: "2 weeks",
      description:
        "We need a complete brand identity package for our new tech startup including logo, color palette, typography, and brand guidelines.",
      jobType: ["Remote", "Contract"],
      createdBy: recruiter.id,
    },
    {
      projectTitle: "Motion Graphics for Product Launch Video",
      status: "active",
      activePeriod: 20,
      expiresAt: new Date(now.getTime() + 20 * 24 * 60 * 60 * 1000),
      category: ["Video", "Motion Graphics"],
      budget: "$800 - $1500",
      timeFrame: "3 weeks",
      description:
        "Looking for a motion graphics artist to create animated elements for our product launch video. Must have experience with After Effects.",
      jobType: ["Remote", "Freelance"],
      createdBy: recruiter.id,
    },
    {
      projectTitle: "UI/UX Design for Mobile App",
      status: "active",
      activePeriod: 25,
      expiresAt: new Date(now.getTime() + 25 * 24 * 60 * 60 * 1000),
      category: ["Design", "UI/UX"],
      budget: "$1000 - $2000",
      timeFrame: "1 month",
      description:
        "We are building a lifestyle app and need a talented UI/UX designer to create beautiful and intuitive screens. Figma experience required.",
      jobType: ["Remote", "Part-time"],
      createdBy: recruiter.id,
    },
  ]);

  console.log("✅ Jobs created:", jobs.length);

  // ── Jobs posted by professional (so MY PROJECTS shows for professional too) ──
  await Job.deleteMany({ createdBy: professional.id });
  const professionalJobs = await Job.insertMany([
    {
      projectTitle: "Logo Design for Coffee Brand",
      status: "active",
      activePeriod: 14,
      expiresAt: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000),
      category: ["Design", "Branding"],
      budget: "$200 - $500",
      timeFrame: "1 week",
      description: "Need a modern logo for a specialty coffee brand.",
      jobType: ["Remote", "Contract"],
      createdBy: professional.id,
    },
  ]);
  console.log("✅ Professional jobs created:", professionalJobs.length);

  // ── Portfolio Works (ShareMusicCreation) ──
  await ShareMusicCreation.deleteMany({ createdBy: professional.id });

  await ShareMusicCreation.insertMany([
    {
      workType: "design",
      title: "Minimalist Brand Identity - NovaTech",
      description: "Complete branding package including logo, colors, and typography for a SaaS company.",
      tags: ["branding", "logo", "minimalist"],
      workImages: [
        "https://images.unsplash.com/photo-1561070791-2526d30994b5?w=600",
        "https://images.unsplash.com/photo-1626785774573-4b799315345d?w=600",
      ],
      category: "Branding",
      subcategory: "Logo Design",
      status: "active",
      createdBy: professional.id,
      updatedBy: professional.id,
    },
    {
      workType: "design",
      title: "Motion Graphics Showreel 2024",
      description: "A collection of motion graphics projects including title animations and product demos.",
      tags: ["motion", "animation", "after effects"],
      workImages: [
        "https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?w=600",
        "https://images.unsplash.com/photo-1536240478700-b869ad10f1c7?w=600",
      ],
      category: "Motion Graphics",
      subcategory: "Animation",
      status: "active",
      createdBy: professional.id,
      updatedBy: professional.id,
    },
    {
      workType: "design",
      title: "E-Commerce App UI Design",
      description: "Full UI design for a fashion e-commerce mobile app with 30+ screens.",
      tags: ["ui", "ux", "mobile", "figma"],
      workImages: [
        "https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?w=600",
        "https://images.unsplash.com/photo-1551650975-87deedd944c3?w=600",
      ],
      category: "UI/UX",
      subcategory: "Mobile App",
      status: "active",
      createdBy: professional.id,
      updatedBy: professional.id,
    },
  ]);

  console.log("✅ Portfolio works created");

  // ── Chats ──
  const works = await ShareMusicCreation.find({ createdBy: professional.id }).limit(3).lean();

  await Chat.deleteMany({ participants: { $all: [recruiter._id, professional._id] } });
  await AppliedJobs.deleteMany({ createdBy: professional._id });

  // 1. Inquiry chat: professional sends first message from recruiter's portfolio/work page
  //    → appears in recruiter's Inquiries tab (inquiry: true)
  //    → after recruiter replies, inquiry becomes false → moves to All Messages
  await Chat.create({
    participants: [recruiter._id, professional._id],
    type: "direct",
    inquiry: true,   // ← sent from work/portfolio page
    isRead: [professional._id],
    messages: [
      {
        sender: professional._id,
        text: "Hi! I saw your Mountain Villa Landscape project. I'd love to discuss a potential collaboration on a similar project.",
        createdAt: new Date(Date.now() - 60 * 60 * 1000 * 10),
        readby: false,
      },
    ],
  });

  // 3. Direct chat: recruiter ↔ professional (normal inbox — inquiry already replied to)
  await Chat.create({
    participants: [recruiter._id, professional._id],
    type: "direct",
    inquiry: false,
    isRead: [recruiter._id, professional._id],
    messages: [
      {
        sender: recruiter._id,
        text: "Hi Maya, I came across your portfolio and I'm impressed with your work!",
        createdAt: new Date(Date.now() - 60 * 60 * 1000 * 3),
        readby: true,
      },
      {
        sender: professional._id,
        text: "Thank you Alex! I'd love to hear more about your project.",
        createdAt: new Date(Date.now() - 60 * 60 * 1000 * 2),
        readby: true,
      },
      {
        sender: recruiter._id,
        text: "We're looking for a brand identity designer for a tech startup. Are you available?",
        createdAt: new Date(Date.now() - 60 * 60 * 1000),
        readby: false,
      },
    ],
  });

  // 2. Job application chat: professional applies to recruiter's first job
  const job = jobs[0];

  // Create AppliedJobs entry (used for application count on job)
  await AppliedJobs.create({
    musicIds: [],
    message: "I have 5 years of experience in brand identity and would love to work on this project!",
    jobId: job._id,
    createdBy: professional._id,
  });

  await Chat.create({
    participants: [recruiter._id, professional._id],
    type: "job_application",
    jobId: job._id,
    inquiry: false,
    isRead: [recruiter._id],
    messages: [
      {
        sender: professional._id,
        text: "Hi! I would like to apply for this position.",
        isCard: true,
        cardData: {
          type: "jobApplication",
          applicant: {
            id: professional.id,
            name: "Maya Professional",
            profilePicture: "https://i.pravatar.cc/150?img=47",
            coverUrl: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800",
            country: "USA",
            city: "New York",
            aboutMe: "Passionate designer with 5+ years of experience in branding and visual identity.",
            popularWorks: works.map((w) => ({
              _id: w._id,
              title: w.title,
              workImages: w.workImages || [],
              coverUrl: (w.workImages || [])[0] || "",
            })),
          },
        },
        createdAt: new Date(Date.now() - 60 * 60 * 1000 * 5),
        readby: false,
      },
      {
        sender: professional._id,
        text: "I have 5 years of experience in brand identity and would love to work on this project!",
        createdAt: new Date(Date.now() - 60 * 60 * 1000 * 4),
        readby: false,
      },
    ],
  });

  console.log("✅ Chats created");

  // ── Summary ──
  console.log("\n─────────────────────────────────");
  console.log("🎉 Seeding complete!\n");
  console.log("Login credentials:");
  console.log("  Recruiter (isClient):  recruiter@example.com / password123");
  console.log("  Professional:          professional@example.com / password123");
  console.log("  Admin:                 admin@example.com / password123");
  console.log("─────────────────────────────────\n");
}

// ─── Run ─────────────────────────────────────────────────────────────────────
connect()
  .then(seed)
  .catch((err) => {
    console.error("❌ Seeder error:", err.message);
    process.exit(1);
  })
  .finally(() => mongoose.disconnect());
