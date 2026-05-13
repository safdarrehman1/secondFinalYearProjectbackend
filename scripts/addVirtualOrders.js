const mongoose = require("mongoose");
const config = require("../src/config/config");
const { ShareMusicCreation, User, Order, UserSpace } = require("../src/models");
const RatingService = require("../src/services/rating.service");
const logger = require("../src/config/logger");

/**
 * Script to add virtual orders and ratings to sellers.
 * Sellers are identified as users who have documents in ShareMusicCreation.
 *
 * Usage:
 *   node scripts/addVirtualOrders.js [--dry-run]
 */

const REVIEW_COMPONENTS = {
  prefixes: [
    "Absolutely amazing!",
    "Outstanding work!",
    "Really impressed with the quality.",
    "The best experience I've had so far.",
    "Top-notch professional.",
    "Simply incredible talent.",
    "A phenomenal result!",
    "So happy with the outcome.",
    "Exactly what I was looking for.",
    "Exceeded all my expectations.",
    "Totally blown away by the result!",
    "One of the best creators here.",
    "Exceptional service and talent.",
    "Brilliant work from start to finish.",
    "Way better than I imagined.",
    "Stellar performance!",
    "Pure perfection in every way.",
    "Could not be happier with this.",
    "Truly gifted professional.",
    "Wow, just wow!",
    "A master at what they do.",
    "Quality that speaks for itself.",
    "Remarkable attention to my needs.",
    "Absolutely first-class service.",
    "The quality is just on another level.",
  ],
  bodies: [
    "The composition is beautiful and the production quality is professional.",
    "Every detail was handled with great care and creativity.",
    "They understood my vision perfectly and brought it to life.",
    "The attention to detail in the mix and arrangement is superb.",
    "Great communication and very receptive to feedback.",
    "Very fast turnaround without compromising on quality.",
    "The musicality and technical skill shown here is rare.",
    "A true master of their craft, the result speaks for itself.",
    "Professional, polite, and exceptionally talented.",
    "The final delivery was polished and ready for use immediately.",
    "The sound design is crisp and fits the mood perfectly.",
    "I was amazed at how quickly they captured the right vibe.",
    "They went above and beyond to make sure everything was right.",
    "The artistic direction they took was exactly what the project needed.",
    "Incredibly easy to work with and very knowledgeable.",
    "They have a unique ability to translate ideas into sound.",
    "The creative input they provided was invaluable to the final product.",
    "Everything was delivered exactly as promised, if not better.",
    "They managed to exceed the high standards I set for this work.",
    "Such a smooth process from the initial concept to delivery.",
    "The balance and clarity in the final audio is just amazing.",
    "They brought a level of sophistication that I haven't seen elsewhere.",
    "The emotional depth of the music really resonates with the audience.",
    "It's rare to find someone who gets it right on the first try like this.",
    "Their expertise shines through in every single track they produce.",
  ],
  suffixes: [
    "Highly recommended!",
    "Will definitely be coming back for more.",
    "I look forward to our next project together.",
    "Best value for money on this platform.",
    "Don't hesitate to book this seller.",
    "A+++ service all the way.",
    "Thank you so much for the hard work!",
    "You won't find anyone better for this type of work.",
    "Five stars all around!",
    "A pleasure to work with from start to finish.",
    "If you need quality, this is the place to get it.",
    "I'll be recommending this to all my colleagues.",
    "Worth every single penny and more.",
    "I'm already planning my next order with them.",
    "Solid 10/10 experience.",
    "Keep up the fantastic work!",
    "This seller is a hidden gem on this site.",
    "You have made a regular customer out of me.",
    "Simply the best service I've experienced in a long time.",
    "Do yourself a favor and hire them now.",
    "A total professional who delivers real results.",
    "So glad I chose this creator for my project.",
    "Expect a lot more orders from me in the future!",
    "Greatest collaboration I've had so far.",
    "One of those rare providers who actually over-delivers.",
  ],
};

const getRandomReview = () => {
  const { prefixes, bodies, suffixes } = REVIEW_COMPONENTS;
  const p = prefixes[Math.floor(Math.random() * prefixes.length)];
  const b = bodies[Math.floor(Math.random() * bodies.length)];
  const s = suffixes[Math.floor(Math.random() * suffixes.length)];

  // Randomly decide structure to avoid "P B S" pattern every time
  const structures = [`${p} ${b} ${s}`, `${p} ${b}`, `${b} ${s}`, `${p} ${s}`];

  return structures[Math.floor(Math.random() * structures.length)];
};

const addVirtualOrders = async () => {
  const dryRun = process.argv.includes("--dry-run");

  try {
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    logger.info(`Connected to MongoDB ${dryRun ? "(DRY RUN)" : ""}`);

    const sellerIds = await ShareMusicCreation.distinct("createdBy");
    logger.info(`Found ${sellerIds.length} unique sellers.`);

    const buyers = await User.find({
      _id: { $nin: sellerIds },
      testAccount: true,
    });
    logger.info(`Found ${buyers.length} potential test buyers.`);

    if (buyers.length === 0) {
      logger.error(
        "No potential test buyers found. Cannot create virtual orders.",
      );
      process.exit(1);
    }

    // Shuffle seller IDs to randomly assign target ratings
    const shuffledSellers = [...sellerIds].sort(() => 0.5 - Math.random());
    const totalSellers = shuffledSellers.length;

    // Better distribution logic including fallback for few sellers
    // 30% 4.8, 30% 4.9, 40% 5.0
    const getTargetRating = (idx, total) => {
      const p = (idx + 1) / total;
      if (p <= 0.3) return 4.8;
      if (p <= 0.6) return 4.9;
      return 5.0;
    };

    for (let sIdx = 0; sIdx < totalSellers; sIdx++) {
      const sellerId = shuffledSellers[sIdx];
      const seller = await User.findById(sellerId);
      if (!seller) continue;

      const targetRating = getTargetRating(sIdx, totalSellers);

      const userSpace = await UserSpace.findOne({ createdBy: sellerId });
      const services =
        userSpace && userSpace.myServices && userSpace.myServices.length > 0
          ? userSpace.myServices
          : [`Virtual Order`];

      const numOrders = Math.floor(Math.random() * (20 - 3 + 1)) + 3;
      logger.info(
        `Creating ${numOrders} virtual orders for seller ${seller.name} (${sellerId}) targeting average ${targetRating}`,
      );

      let daysAgo = 2; // Start from 2 days ago
      let ordersCreated = 0;

      while (ordersCreated < numOrders) {
        // Decide if this day has 1 or 2 orders (80% chance of 1, 20% chance of 2)
        const ordersInThisSlot = Math.random() < 0.2 ? 2 : 1;

        // Ensure we don't exceed the total requested orders
        const toCreate = Math.min(ordersInThisSlot, numOrders - ordersCreated);

        for (let j = 0; j < toCreate; j++) {
          const randomBuyer = buyers[Math.floor(Math.random() * buyers.length)];
          const review = getRandomReview();
          const randomService =
            services[Math.floor(Math.random() * services.length)];

          // Logic to achieve targetRating:
          // 5.0 -> all orders must be 5.0
          // 4.9 -> mostly 5.0 with some 4.0 or 4.5 or 4.8 (weighted towards 4.9 overall)
          // 4.8 -> mostly 5.0 with more 4.0 or 4.5
          let rating;
          if (targetRating === 5.0) {
            rating = 5.0;
          } else if (targetRating === 4.9) {
            // Approx 90% chance of 5.0, 10% chance of 4.0 leads to average 4.9
            rating = Math.random() < 0.9 ? 5.0 : 4.0;
          } else {
            // Approx 80% chance of 5.0, 20% chance of 4.0 leads to average 4.8
            rating = Math.random() < 0.8 ? 5.0 : 4.0;
          }

          const orderDate = new Date();
          orderDate.setDate(orderDate.getDate() - daysAgo);
          // Randomize time of day
          orderDate.setHours(
            Math.floor(Math.random() * 24),
            Math.floor(Math.random() * 60),
          );

          const orderData = {
            type: "music_order",
            status: "complete",
            seller: sellerId,
            createdBy: sellerId,
            recruiterId: randomBuyer._id,
            buyer: randomBuyer._id,
            title:
              randomService === "Virtual Order"
                ? `${randomService} #${ordersCreated + 1}`
                : randomService,
            totalAmount: Math.floor(Math.random() * 500) + 50,
            price: Math.floor(Math.random() * 500) + 50,
            buyerRating: rating,
            buyerReview: review,
            buyerReviewAt: orderDate,
            completedAt: orderDate,
            startTime: orderDate,
            createdAt: orderDate,
            activities: [
              {
                action: "created",
                by: randomBuyer._id,
                at: orderDate,
                note: "Order created",
              },
              {
                action: "complete",
                by: sellerId,
                at: orderDate,
                note: "Order completed",
              },
              {
                action: "review_set",
                by: randomBuyer._id,
                at: orderDate,
                note: review,
                meta: { rating },
              },
            ],
          };

          if (dryRun) {
            logger.info(
              `[DRY RUN] Would create order "${orderData.title}" from ${
                randomBuyer.name
              } (Test Account) to ${
                seller.name
              } (Date: ${orderDate.toDateString()} ${orderDate.getHours()}:${orderDate.getMinutes()}) with rating ${rating}`,
            );
          } else {
            try {
              await Order.create(orderData);
            } catch (err) {
              logger.error(`Failed to create order: ${err.message}`);
            }
          }
          ordersCreated++;
        }

        // Add a gap of 2-5 days between order slots to ensure they are not continuous
        daysAgo += Math.floor(Math.random() * (5 - 2 + 1)) + 2;
      }

      if (!dryRun) {
        // Update metrics for seller
        await RatingService.updateUserMetrics(sellerId);
        logger.info(`Updated metrics for seller ${seller.name}`);
      }
    }

    // Also update a few buyers just in case
    if (!dryRun) {
      const sampleBuyers = buyers.slice(0, 10);
      for (const buyer of sampleBuyers) {
        await RatingService.updateUserMetrics(buyer._id);
      }
      logger.info("Updated metrics for a sample of test buyers.");
    }

    logger.info(
      `Virtual orders ${
        dryRun ? "simulation" : "creation"
      } completed successfully.`,
    );
    process.exit(0);
  } catch (error) {
    logger.error("Error adding virtual orders:", error);
    process.exit(1);
  }
};

addVirtualOrders();
