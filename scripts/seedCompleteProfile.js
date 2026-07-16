/**
 * Seeds one complete profile for manually testing every User Space tab.
 * Safe to run repeatedly: records are updated or replaced by stable seed keys.
 */
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const config = require("../src/config/config");

const { Schema } = mongoose;

const looseModel = (name, collection) =>
  mongoose.models[name] ||
  mongoose.model(name, new Schema({}, { strict: false, timestamps: true }), collection);

const User = require("../src/models/user.model");
const UserSpace = require("../src/models/userSpace.model");
const Blog = require("../src/models/blog.model");
const Order = require("../src/models/order.model");
const ShareMusicCreation = looseModel("SeedShareMusicCreation", "sharemusiccreations");
const ShareMusicAsset = looseModel("SeedShareMusicAsset", "sharemusicassets");

const PROFILE_EMAIL = "complete.profile@example.com";
const PASSWORD = "Profile123!";
const image = "/image/default-picture.jpg";

async function upsertUser(email, data) {
  const password = await bcrypt.hash(PASSWORD, 8);
  return User.findOneAndUpdate(
    { email },
    { $set: { ...data, email, password, isEmailVerified: true, isActive: true, accountStatus: "active", testAccount: true } },
    { new: true, upsert: true, runValidators: false },
  );
}

async function seed() {
  await mongoose.connect(config.mongoose.url, config.mongoose.options);

  const reviewer = await upsertUser("complete.profile.reviewer@example.com", {
    name: "Ayesha Khan",
    profilePicture: image,
  });
  const followedProfessional = await upsertUser("complete.profile.following@example.com", {
    name: "Hamza Creative",
    profilePicture: image,
  });
  const profile = await upsertUser(PROFILE_EMAIL, {
    name: "Noor Ahmed",
    profilePicture: image,
    balance: 1250,
    following: [followedProfessional._id],
    sellerMetrics: { averageRating: 4.9, totalReviews: 2, totalOrders: 8, lastUpdated: new Date() },
    buyerMetrics: { averageRating: 4.8, totalOrders: 3, lastUpdated: new Date() },
    professionMetadata: {
      creationOccupations: ["Product Designer", "Frontend Developer"],
      businessOccupation: "Digital Product Consultant",
      displayProfession: "Product Designer & Frontend Developer",
      lastUpdated: new Date(),
    },
  });

  await UserSpace.findOneAndUpdate(
    { createdBy: profile.id },
    {
      $set: {
        firstName: "Noor",
        lastName: "Ahmed",
        isClient: false,
        creationOccupation: ["Product Designer", "Frontend Developer", "UI/UX Designer"],
        businessOccupation: "Digital Product Consultant",
        address: "Lahore, Pakistan",
        location: "Pakistan",
        state: "Punjab",
        city: "Lahore",
        designFees: 2500,
        companyOrStudio: "Northstar Digital Studio",
        websiteUrl: "https://example.com/noor",
        aboutMe: "I design and build thoughtful digital products for ambitious teams, combining user research, visual systems, and modern frontend engineering.",
        softwareTool: ["Figma", "React", "Next.js", "Adobe Illustrator"],
        myServices: ["Product Design", "UI/UX Design", "Frontend Development"],
        profilePicture: image,
        coverUrl: image,
        createdBy: profile.id,
        updatedBy: profile.id,
      },
    },
    { upsert: true, new: true, runValidators: false },
  );

  await UserSpace.findOneAndUpdate(
    { createdBy: followedProfessional.id },
    { $set: { firstName: "Hamza", lastName: "Creative", address: "Islamabad, Pakistan", aboutMe: "Brand strategist and visual designer.", creationOccupation: ["Brand Designer"], profilePicture: image, createdBy: followedProfessional.id, updatedBy: followedProfessional.id } },
    { upsert: true, new: true, runValidators: false },
  );

  await ShareMusicCreation.deleteMany({ seedOwner: PROFILE_EMAIL });
  const works = await ShareMusicCreation.insertMany([
    { seedOwner: PROFILE_EMAIL, workType: "design", title: "Fintech Mobile Banking Experience", description: "End-to-end product design for a secure and accessible mobile banking platform.", tags: ["product design", "fintech", "mobile"], workImages: [image], category: "UI/UX Design", subcategory: "Mobile App", status: "active", createdBy: profile.id, updatedBy: profile.id, views: [reviewer._id], likes: [reviewer._id], comments: [] },
    { seedOwner: PROFILE_EMAIL, workType: "design", title: "Northstar Design System", description: "A scalable component library and token system shared across web products.", tags: ["design system", "figma", "frontend"], workImages: [image], category: "Product Design", subcategory: "Design Systems", status: "active", createdBy: profile.id, updatedBy: profile.id, views: [reviewer._id, followedProfessional._id], likes: [reviewer._id], comments: [] },
    { seedOwner: PROFILE_EMAIL, workType: "design", title: "Healthcare Analytics Dashboard", description: "A clear clinical analytics workspace designed for faster operational decisions.", tags: ["dashboard", "healthcare", "analytics"], workImages: [image], category: "Web Design", subcategory: "Dashboard", status: "active", createdBy: profile.id, updatedBy: profile.id, views: [], likes: [], comments: [] },
  ]);

  await ShareMusicAsset.deleteMany({ seedOwner: PROFILE_EMAIL });
  const assets = await ShareMusicAsset.insertMany([
    { seedOwner: PROFILE_EMAIL, title: "SaaS Dashboard UI Kit", category: "UI Kits", subcategory: "Dashboard", personalLicensePrice: 24, commercialLicensePrice: 79, extendedCommercialPrice: 149, assetImages: [image], description: "A production-ready dashboard UI kit with responsive layouts and reusable components.", tags: ["dashboard", "ui kit", "figma", "saas"], softwareTools: ["Figma"], uploadAsset: [], fileType: "FIG", fileSize: 18, createdBy: profile._id, updatedBy: profile._id, status: "published", likes: [reviewer._id], views: [reviewer._id] },
    { seedOwner: PROFILE_EMAIL, title: "Professional Portfolio Template", category: "Templates", subcategory: "Portfolio", personalLicensePrice: 18, commercialLicensePrice: 55, assetImages: [image], description: "A polished portfolio template for designers, developers, and consultants.", tags: ["portfolio", "template", "professional", "responsive"], softwareTools: ["Figma", "Next.js"], uploadAsset: [], fileType: "ZIP", fileSize: 12, createdBy: profile._id, updatedBy: profile._id, status: "published", likes: [], views: [reviewer._id] },
  ]);

  await Blog.deleteMany({ createdBy: profile._id });
  await Blog.insertMany([
    { seedOwner: PROFILE_EMAIL, title: "Designing Products People Trust", description: "<p>Trust is built through clarity, consistency, accessibility, and honest product decisions. Here are practical lessons from designing high-stakes digital experiences.</p>", coverUrl: image, classification: ["Product Design", "UX"], createdBy: profile._id, userName: profile.name, slug: `designing-products-people-trust-${profile.id}`, status: "published", isActive: true, likes: [reviewer._id], viewedBy: [reviewer._id, followedProfessional._id], comments: [{ user: reviewer._id, comment: "Practical and thoughtful advice.", createdAt: new Date() }] },
    { seedOwner: PROFILE_EMAIL, title: "From Figma to a Maintainable Frontend", description: "<p>A workflow for translating design tokens and reusable components into a frontend that stays consistent as the product grows.</p>", coverUrl: image, classification: ["Frontend", "Design Systems"], createdBy: profile._id, userName: profile.name, slug: `figma-to-maintainable-frontend-${profile.id}`, status: "published", isActive: true, likes: [], viewedBy: [reviewer._id], comments: [] },
  ]);

  await Order.deleteMany({ seedOwner: PROFILE_EMAIL });
  await Order.collection.insertMany([
    { seedOwner: PROFILE_EMAIL, recruiterId: reviewer._id, buyer: reviewer._id, seller: profile._id, createdBy: profile._id, title: "Product dashboard redesign", totalAmount: 1800, status: "complete", type: "gig_order", paymentMethod: "stripe", buyerRating: 5, buyerReview: "Excellent product thinking, communication, and attention to detail throughout the project.", buyerReviewAt: new Date(), sellerReply: "Thank you—it was a pleasure collaborating on the product.", sellerRepliedAt: new Date(), createdAt: new Date(), updatedAt: new Date() },
    { seedOwner: PROFILE_EMAIL, recruiterId: reviewer._id, buyer: reviewer._id, seller: profile._id, createdBy: profile._id, title: "Design system consultation", totalAmount: 950, status: "complete", type: "gig_order", paymentMethod: "stripe", buyerRating: 5, buyerReview: "The new design system made our handoff faster and our interface much more consistent.", buyerReviewAt: new Date(), createdAt: new Date(), updatedAt: new Date() },
  ]);

  profile.collections = [works[0]._id, assets[0]._id, assets[1]._id];
  profile.following = [followedProfessional._id];
  await profile.save();

  const counts = {
    works: await ShareMusicCreation.countDocuments({ seedOwner: PROFILE_EMAIL }),
    assets: await ShareMusicAsset.countDocuments({ seedOwner: PROFILE_EMAIL }),
    reviews: await Order.countDocuments({ seedOwner: PROFILE_EMAIL }),
    following: profile.following.length,
    collections: profile.collections.length,
    blogs: await Blog.countDocuments({ createdBy: profile._id }),
  };

  console.log(JSON.stringify({ email: PROFILE_EMAIL, password: PASSWORD, userId: profile.id, counts }, null, 2));
}

seed()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => mongoose.disconnect());
