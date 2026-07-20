const mongoose = require("mongoose");
const config = require("../src/config/config");
const { User } = require("../src/models");

const seedFollowers = async () => {
  try {
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    console.log("Connected to MongoDB for seeding followers...");

    const alex = await User.findOne({ email: "alex.mern.dev@gmail.com" });
    if (!alex) {
      console.error("Alex Rivera user not found");
      process.exit(1);
    }

    const otherUsers = await User.find({ _id: { $ne: alex._id } }).limit(5);

    // Make Alex follow other users
    alex.following = otherUsers.map((u) => u._id);
    await alex.save();

    // Make other users follow Alex back
    for (const u of otherUsers) {
      if (!u.following) u.following = [];
      if (!u.following.map((id) => id.toString()).includes(alex._id.toString())) {
        u.following.push(alex._id);
        await u.save();
      }
    }

    console.log("Following & Followers synced successfully!");
    console.log(`Alex following: ${alex.following.length} users`);
    console.log(`Alex followers: ${otherUsers.length} users`);

    process.exit(0);
  } catch (err) {
    console.error("Error seeding followers:", err);
    process.exit(1);
  }
};

seedFollowers();
