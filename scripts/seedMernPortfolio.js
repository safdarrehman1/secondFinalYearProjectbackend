const mongoose = require("mongoose");
const config = require("../src/config/config");
const { User, Gig, Blog, Order } = require("../src/models");
const SkillGapCreation = require("../src/models/skillGapCreation.model");
const UserSpace = require("../src/models/userSpace.model");

const seedMernPortfolio = async () => {
  try {
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    console.log("Connected to MongoDB for seeding Alex Rivera's complete portfolio...");

    const email = "alex.mern.dev@gmail.com";
    const user = await User.findOne({ email });

    if (!user) {
      console.error("User alex.mern.dev@gmail.com not found. Run seedMernDeveloper.js first.");
      process.exit(1);
    }

    console.log("Found Alex Rivera user ID:", user._id);

    // 1. Clean existing records for this user
    await SkillGapCreation.deleteMany({ createdBy: user._id });
    await Gig.deleteMany({ createdBy: user._id.toString() });
    await Blog.deleteMany({ createdBy: user._id });
    await Order.deleteMany({ seller: user._id });

    // 2. SEED SHOWCASES (SkillGapCreation)
    const showcases = await SkillGapCreation.insertMany([
      {
        workType: "design",
        title: "MERN Stack SaaS Platform & Real-Time Analytics Dashboard",
        category: "Architecture Design Services",
        subcategory: "Full-Stack Systems",
        description:
          "High-performance MERN Stack enterprise platform featuring MongoDB aggregation pipelines, Express/Node.js REST & WebSockets, React.js with Redux Toolkit, Tailwind CSS, Stripe subscription billing, and real-time interactive charts.",
        workImages: [
          "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=1200&q=80",
          "https://images.unsplash.com/photo-1555066931-4365d14bab8c?auto=format&fit=crop&w=1200&q=80",
        ],
        tags: ["MERN", "React", "Node.js", "MongoDB", "Redux", "TailwindCSS"],
        softwareTool: ["React.js", "Node.js", "MongoDB", "Express.js", "TypeScript", "Tailwind CSS"],
        embeds: "",
        views: 1840,
        totalCollect: 64,
        createdBy: user._id,
      },
      {
        workType: "design",
        title: "React Native Mobile Banking & Crypto Wallet App (iOS & Android)",
        category: "Animation & Video Design Services",
        subcategory: "Mobile Development",
        description:
          "Cross-platform React Native mobile application supporting biometric authentication, real-time transaction streaming, interactive portfolio charts, custom dark UI theme, and push notifications.",
        workImages: [
          "https://images.unsplash.com/photo-1563986768609-322da13575f3?auto=format&fit=crop&w=1200&q=80",
          "https://images.unsplash.com/photo-1556742049-0a670e4a4591?auto=format&fit=crop&w=1200&q=80",
        ],
        tags: ["React Native", "Expo", "Mobile App", "TypeScript", "Redux Toolkit"],
        softwareTool: ["React Native", "Expo", "TypeScript", "Redux Toolkit", "Firebase"],
        embeds: "",
        views: 2150,
        totalCollect: 89,
        createdBy: user._id,
      },
      {
        workType: "design",
        title: "Real-Time Team Collaboration & Code Workspace",
        category: "Props & Asset Creation Services",
        subcategory: "Web Systems",
        description:
          "Collaborative cloud workspace built using Node.js, WebSockets (Socket.io), MongoDB, and Monaco Code Editor with live multi-cursor synchronization.",
        workImages: [
          "https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=1200&q=80",
          "https://images.unsplash.com/photo-1531403009284-440f080d1e12?auto=format&fit=crop&w=1200&q=80",
        ],
        tags: ["Node.js", "WebSockets", "MongoDB", "React", "FullStack"],
        softwareTool: ["Node.js", "React.js", "Socket.io", "MongoDB", "Docker"],
        embeds: "",
        views: 1390,
        totalCollect: 42,
        createdBy: user._id,
      },
    ]);

    console.log(`Seeded ${showcases.length} Showcases successfully.`);

    // 3. SEED PROJECTS FOR SALE / GIGS (Gig)
    const gigs = await Gig.insertMany([
      {
        seller: user._id,
        title: "I will develop a custom full stack MERN web application",
        category: "Architecture Design Services",
        subcategory: "Full-Stack Systems",
        description:
          "Professional end-to-end MERN stack web development. I architect scalable Node.js backend services, design robust MongoDB databases, and build fast, responsive React frontend interfaces.",
        packages: {
          basic: {
            title: "Basic React UI Component",
            description: "Single-page responsive React frontend with Tailwind CSS styling and clean state setup.",
            price: 120,
            revisions: 2,
            features: ["Responsive Design", "Source Code", "Component Architecture"],
          },
          standard: {
            title: "Standard MERN Web App",
            description: "Full-stack MERN web application with JWT authentication, MongoDB models & REST APIs.",
            price: 450,
            revisions: 5,
            features: ["Full-Stack MERN", "Database Integration", "User Auth & Roles", "RESTful Endpoints"],
          },
          premium: {
            title: "Enterprise MERN & Mobile App",
            description: "Complete MERN web platform + React Native iOS/Android app with WebSockets & Stripe.",
            price: 950,
            revisions: 10,
            features: ["Web & Mobile App", "Real-Time WebSockets", "Payment Integration", "Admin Dashboard"],
          },
        },
        tags: ["mern", "react", "nodejs", "mongodb", "express"],
        videos: ["https://images.unsplash.com/photo-1555066931-4365d14bab8c?auto=format&fit=crop&w=800&q=80"],
        referenceArtworks: ["https://images.unsplash.com/photo-1555066931-4365d14bab8c?auto=format&fit=crop&w=800&q=80"],
        requirements: "Provide project wireframes or feature specifications.",
        createdBy: user._id.toString(),
      },
      {
        seller: user._id,
        title: "I will build a cross platform React Native mobile app iOS and Android",
        category: "Animation & Video Design Services",
        subcategory: "Mobile App Development",
        description:
          "High-performance React Native and Expo mobile app development for iOS and Android. Includes TypeScript, Redux state management, push notifications, and API integrations.",
        packages: {
          basic: {
            title: "Mobile Screen UI Setup",
            description: "3 polished React Native app screens with navigation and static mock data.",
            price: 150,
            revisions: 2,
            features: ["iOS & Android Layout", "Source Code"],
          },
          standard: {
            title: "Full Mobile App Frontend",
            description: "Complete 8-screen React Native mobile app with state management & navigation.",
            price: 550,
            revisions: 5,
            features: ["Complete App UI", "State Management", "API Ready"],
          },
          premium: {
            title: "Full-Stack Mobile App",
            description: "Production-ready mobile app + Node.js backend server with push notifications & database.",
            price: 1100,
            revisions: 10,
            features: ["Cross-Platform App", "Backend API Server", "App Store Submission Guide"],
          },
        },
        tags: ["react-native", "expo", "ios", "android", "typescript"],
        videos: ["https://images.unsplash.com/photo-1563986768609-322da13575f3?auto=format&fit=crop&w=800&q=80"],
        referenceArtworks: ["https://images.unsplash.com/photo-1563986768609-322da13575f3?auto=format&fit=crop&w=800&q=80"],
        requirements: "App design sketches or desired functionality overview.",
        createdBy: user._id.toString(),
      },
    ]);

    console.log(`Seeded ${gigs.length} Gigs / Projects for Sale.`);

    // 4. SEED BLOGS (Blog)
    const blogs = await Blog.insertMany([
      {
        title: "Mastering Full-Stack MERN & React Native Architecture in 2026",
        slug: "mastering-full-stack-mern-react-native-2026",
        description:
          "<p>Architecting scalable web and mobile applications requires strict separation of concerns, clean state management with Redux Toolkit, and robust MongoDB index design...</p><h2>Key Architectural Pillars</h2><ul><li>Modular REST & GraphQL API endpoints</li><li>TypeScript types shared across Web and Mobile</li><li>JWT Authentication & Security Middleware</li></ul>",
        coverUrl: "https://images.unsplash.com/photo-1555066931-4365d14bab8c?auto=format&fit=crop&w=1200&q=80",
        classification: ["MERN Stack", "React Native", "Web Development"],
        likesCount: 52,
        commentsCount: 8,
        createdBy: user._id,
        userName: "Alex Rivera",
        status: "published",
        isActive: true,
      },
      {
        title: "Optimizing MongoDB & Node.js Endpoints for High Concurrency",
        slug: "optimizing-mongodb-nodejs-high-concurrency",
        description:
          "<p>Learn how to optimize Express.js routes and MongoDB aggregation queries to achieve sub-50ms response times under thousands of simultaneous requests...</p>",
        coverUrl: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=1200&q=80",
        classification: ["Backend", "Node.js", "MongoDB"],
        likesCount: 41,
        commentsCount: 6,
        createdBy: user._id,
        userName: "Alex Rivera",
        status: "published",
        isActive: true,
      },
    ]);

    console.log(`Seeded ${blogs.length} Blogs.`);

    // 5. SEED REVIEWS & COMPLETED ORDERS (Order)
    const otherUsers = await User.find({ _id: { $ne: user._id } }).limit(3);
    const buyer1 = otherUsers[0] || user;
    const buyer2 = otherUsers[1] || user;

    const orders = await Order.insertMany([
      {
        seller: user._id,
        buyer: buyer1._id,
        createdBy: buyer1._id,
        gig: gigs[0]._id,
        gigId: gigs[0]._id,
        packageType: "standard",
        packageDetails: {
          title: "Standard MERN Web App",
          description: "Full-stack MERN web application with JWT authentication & MongoDB models.",
          price: 450,
          deliveryTime: 7,
          revisions: 5,
          features: ["Full-Stack MERN", "Database Integration"],
        },
        totalAmount: 450,
        price: 450,
        status: "complete",
        rating: 5,
        review: "Alex built an incredible MERN stack web application for us! Code quality was exceptional and delivery was right on schedule.",
        buyerRating: 5,
        buyerReview: "Alex built an incredible MERN stack web application for us! Code quality was exceptional and delivery was right on schedule.",
        buyerReviewAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        sellerReply: "Thank you so much! It was a pleasure collaborating with you on this platform.",
      },
      {
        seller: user._id,
        buyer: buyer2._id,
        createdBy: buyer2._id,
        gig: gigs[1]._id,
        gigId: gigs[1]._id,
        packageType: "premium",
        packageDetails: {
          title: "Full-Stack Mobile App",
          description: "Production-ready mobile app + Node.js backend server with push notifications.",
          price: 1100,
          deliveryTime: 14,
          revisions: 10,
          features: ["Cross-Platform App", "Backend API Server"],
        },
        totalAmount: 1100,
        price: 1100,
        status: "complete",
        rating: 5,
        review: "Top tier React Native developer. Super responsive, clean TypeScript code, and the mobile app runs flawlessly on iOS and Android.",
        buyerRating: 5,
        buyerReview: "Top tier React Native developer. Super responsive, clean TypeScript code, and the mobile app runs flawlessly on iOS and Android.",
        buyerReviewAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        sellerReply: "Thanks a lot for the feedback! Happy to assist with future updates.",
      },
    ]);

    console.log(`Seeded ${orders.length} Reviews / Completed Orders.`);

    // 6. UPDATE USER FOLLOWING & COLLECTIONS
    const followingIds = otherUsers.map((u) => u._id);
    user.following = followingIds;
    user.collections = showcases.map((s) => s._id.toString());
    await user.save();

    console.log("Updated Alex Rivera user following & collections.");

    console.log("==========================================");
    console.log("ALEX RIVERA PORTFOLIO SEEDED SUCCESSFULLY!");
    console.log("Showcases: 3");
    console.log("Projects for Sale / Gigs: 2");
    console.log("Blogs: 2");
    console.log("Reviews: 2 (5.0 ★ rating)");
    console.log("==========================================");

    process.exit(0);
  } catch (err) {
    console.error("Error seeding portfolio:", err);
    process.exit(1);
  }
};

seedMernPortfolio();
