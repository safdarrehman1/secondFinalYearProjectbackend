const mongoose = require("mongoose");
const config = require("../src/config/config");
const { User } = require("../src/models");
const UserSpace = require("../src/models/userSpace.model");

const seedMernDeveloper = async () => {
  try {
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    console.log("Connected to MongoDB for seeding MERN + React Native Developer...");

    const email = "alex.mern.dev@gmail.com";
    const password = "Developer123";

    // Delete existing test user if present
    await User.deleteOne({ email });
    await UserSpace.deleteOne({ createdBy: { $exists: true }, firstName: "Alex", lastName: "Rivera" });

    // Create User (password pre-save hook will hash password automatically)
    const user = await User.create({
      name: "Alex Rivera",
      email,
      password,
      role: "user",
      isEmailVerified: true,
      profilePicture: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=500&q=80",
    });

    console.log("User created successfully:", user._id);

    // Create complete UserSpace profile
    const userSpace = await UserSpace.create({
      firstName: "Alex",
      lastName: "Rivera",
      isClient: false,
      creationOccupation: [
        "Web Development",
        "Mobile App Development",
        "Software Engineering",
        "Frontend Development",
        "Backend Development",
      ],
      businessOccupation: "Senior MERN Stack & React Native Developer",
      hiring: "Available for Full-time, Part-time & Contract roles",
      address: "San Francisco, CA, USA",
      city: "San Francisco",
      state: "California",
      location: "San Francisco, California, USA",
      companyOrStudio: "FullStack Mobile Studio",
      websiteUrl: "https://alexrivera-dev.com",
      designFees: 65,
      aboutMe:
        "Senior Full-Stack MERN Stack (MongoDB, Express.js, React.js, Node.js) and Mobile App Developer (React Native, Expo, Redux Toolkit, TypeScript, Tailwind CSS, GraphQL, REST APIs, WebSockets). 6+ years of experience architecting scalable web platforms, high-performance iOS and Android mobile apps, real-time messaging, payment gateway integrations (Stripe, Square), and AI-powered web solutions. Proven track record of delivering end-to-end web & mobile applications with sleek UI/UX design, clean modular architecture, and CI/CD pipelines.",
      softwareTool: [
        "React.js",
        "React Native",
        "Node.js",
        "Express.js",
        "MongoDB",
        "TypeScript",
        "Next.js",
        "Redux Toolkit",
        "Tailwind CSS",
        "GraphQL",
        "Docker",
        "AWS",
        "Firebase",
        "PostgreSQL",
      ],
      myServices: [
        "Full-Stack MERN Web App Development",
        "Cross-Platform Mobile App Development (React Native & Expo)",
        "RESTful & GraphQL API Architecture & Integration",
        "Database Design & Optimization (MongoDB / PostgreSQL)",
        "Real-Time Messaging & WebSockets",
        "UI/UX Component Systems & Tailwind Integration",
      ],
      profilePicture:
        "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=500&q=80",
      linkedin: "https://linkedin.com/in/alexrivera-dev",
      x: "https://x.com/alexrivera_dev",
      facebook: "https://facebook.com/alexriveradev",
      createdBy: user._id.toString(),
      updatedBy: user._id.toString(),
    });

    console.log("UserSpace profile created successfully:", userSpace._id);
    console.log("==========================================");
    console.log("MERN STACK + REACT NATIVE DEVELOPER ACCOUNT CREATED:");
    console.log(`Email:    ${email}`);
    console.log(`Password: ${password}`);
    console.log("==========================================");

    process.exit(0);
  } catch (error) {
    console.error("Error seeding developer:", error);
    process.exit(1);
  }
};

seedMernDeveloper();
