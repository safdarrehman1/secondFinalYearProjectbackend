const mongoose = require("mongoose");
const http = require("http");
const { Server } = require("socket.io");
const app = require("./app");
const config = require("./config/config");
const logger = require("./config/logger");
const ChatService = require("./services/chat.service");
const UserService = require("./services/user.service");
const { initializeCronJobs } = require("./utils/cronJobs");
const AttachmentCleanupService = require("./services/attachmentCleanup.service");
const jwt = require("jsonwebtoken");
const { User } = require("./models");
const { tokenTypes } = require("./config/tokens");

let server;
let shuttingDown = false;
global.__databaseMongo;

// Create HTTP server
const httpServer = http.createServer(app);

// Initialize Socket.IO
const io = new Server(httpServer, {
  cors: {
    origin: config.cors.allowedOrigins,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    credentials: true,
  },
});

io.use(async (socket, next) => {
  try {
    const authorization = socket.handshake.headers.authorization || "";
    const token = socket.handshake.auth?.token || authorization.replace(/^Bearer\s+/i, "");
    if (!token) return next(new Error("Authentication required"));

    const payload = jwt.verify(token, config.jwt.secret);
    if (payload.type !== tokenTypes.ACCESS) return next(new Error("Invalid token type"));

    const user = await User.findById(payload.sub).select("_id role isBlock accountStatus");
    if (!user || user.isBlock || user.accountStatus === "cancelled") {
      return next(new Error("User is not allowed to connect"));
    }

    socket.userId = user.id;
    socket.userRole = user.role;
    return next();
  } catch (error) {
    return next(new Error("Invalid or expired authentication token"));
  }
});
mongoose.set("useFindAndModify", false); // Disable deprecated findAndModify warnings

// Establish MongoDB connection
mongoose
  .connect(config.mongoose.url, config.mongoose.options)
  .then(() => {
    logger.info("Connected to MongoDB");
    __databaseMongo = mongoose.connection.db;

    // Initialize cron jobs (after DB connected)
    initializeCronJobs();

    // Initialize attachment cleanup scheduler (after DB connected)
    if (config.env !== "test") {
      logger.info("Initializing attachment cleanup scheduler...");
      AttachmentCleanupService.scheduleCleanup(24);
    }

    // Create admin user if not exists
    UserService.createAdminIfNotExists();

    // Start HTTP server
    server = httpServer.listen(config.port, () => {
      logger.info(`Listening to port ${config.port}`);
    });
  })
  .catch((error) => {
    logger.error("MongoDB connection failed:", error);
    process.exit(1);
  });

// Handle unhandled promise rejections
process.on("unhandledRejection", (err) => {
  logger.error("Unhandled Rejection:", err);
});

// Handle uncaught exceptions
process.on("uncaughtException", (err) => {
  logger.error("Uncaught Exception:", err);
  process.exit(1);
});

const shutdown = async (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`${signal} received; shutting down gracefully`);

  const forceExit = setTimeout(() => {
    logger.error("Graceful shutdown timed out");
    process.exit(1);
  }, 10000);
  forceExit.unref();

  io.close();
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await mongoose.connection.close(false);
  clearTimeout(forceExit);
  process.exit(0);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// Active users map (consider replacing with Redis for scalability)
const activeUsers = new Map();

// Socket.IO configuration
io.on("connection", (socket) => {
  logger.info(`Socket connected user=${socket.userId} socket=${socket.id}`);
  activeUsers.set(socket.userId, socket.id);

  // Handle user joining
  socket.on("join", async (_payload = {}, callback = () => {}) => {
    try {
      activeUsers.set(socket.userId, socket.id);
      callback({ success: true, userId: socket.userId });
    } catch (error) {
      logger.error("Error in join event:", error);
      callback({ success: false, message: "Error joining chat" });
    }
  });

  // Handle sending messages
  socket.on(
    "sendMessage",
    async ({ recipientId, message } = {}, callback = () => {}) => {
      try {
        if (typeof message !== "string" || !message.trim() || !recipientId) {
          return callback({
            success: false,
            message: "Recipient and message are required",
          });
        }

        const chat = await ChatService.saveMessage(
          socket.userId,
          recipientId,
          message.trim(),
        );

        // Emit the message to the recipient if online
        const recipientSocketId = activeUsers.get(recipientId);
        if (recipientSocketId) {
          io.to(recipientSocketId).emit("receiveMessage", {
            senderId: socket.userId,
            message: message.trim(),
          });
        }

        callback({ success: true, chat });
      } catch (error) {
        logger.error("Error sending message:", error);
        callback({ success: false, message: "Error sending message" });
      }
    },
  );

  // Handle blocking user
  socket.on(
    "blockUser",
    async ({ blockedUserId } = {}, callback = () => {}) => {
      try {
        if (!blockedUserId) return callback({ success: false, message: "Blocked user is required" });
        await ChatService.blockUser(socket.userId, blockedUserId);
        const blockedSocketId = activeUsers.get(blockedUserId);

        if (blockedSocketId) {
          io.to(blockedSocketId).emit("userBlocked", {
            message: "You have been blocked by this user",
          });
        }

        callback({
          success: true,
          message: `User ${blockedUserId} has been blocked.`,
        });
      } catch (error) {
        logger.error("Error blocking user:", error);
        callback({ success: false, message: "Error blocking user" });
      }
    },
  );

  // Handle reporting user
  socket.on(
    "reportUser",
    async ({ reportedUserId } = {}, callback = () => {}) => {
      try {
        if (!reportedUserId) return callback({ success: false, message: "Reported user is required" });
        await ChatService.reportUser(socket.userId, reportedUserId);
        callback({
          success: true,
          message: `User ${reportedUserId} has been reported.`,
        });
      } catch (error) {
        logger.error("Error reporting user:", error);
        callback({ success: false, message: "Error reporting user" });
      }
    },
  );

  // Handle typing indicator
  socket.on("typing", ({ recipientId } = {}) => {
    const recipientSocketId = activeUsers.get(recipientId);
    if (recipientSocketId) {
      io.to(recipientSocketId).emit("userTyping", { senderId: socket.userId });
    }
  });

  // Handle read receipt
  socket.on("markAsRead", async ({ chatId } = {}, callback = () => {}) => {
    try {
      if (!chatId) return callback({ success: false, message: "Chat is required" });
      await ChatService.markMessagesAsRead(chatId, socket.userId);
      callback({ success: true });
    } catch (error) {
      logger.error("Error marking messages as read:", error);
      callback({ success: false });
    }
  });

  // Handle user disconnect
  socket.on("disconnect", () => {
    logger.info(`Socket disconnected user=${socket.userId} socket=${socket.id}`);
    for (const [userId, socketId] of activeUsers.entries()) {
      if (socketId === socket.id) {
        activeUsers.delete(userId);
        break;
      }
    }
  });
});
