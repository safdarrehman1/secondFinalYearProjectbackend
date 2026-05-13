const express = require("express");
const router = express.Router();
const chatController = require("../../controllers/chat.controller");
const auth = require("../../middlewares/auth");
const { uploadChatAttachment } = require("../../middlewares/upload");

// Fetch chat history between two users
router.get("/history/:userId", chatController.getChatHistory);

router.get("/users/:role", auth("user", "recruiter"), chatController.getUsers);

router.post("/:recipientId/messages", chatController.sendMessage);

// Upload chat attachment
router.post(
  "/upload-attachment",
  auth("user"),
  uploadChatAttachment.single("attachment"),
  chatController.uploadAttachment,
);

// Download chat attachment (with optional token in query)
router.get(
  "/download-attachment/:filename",
  (req, res, next) => {
    // Check for token in query parameter first
    if (req.query.token && !req.headers.authorization) {
      req.headers.authorization = `Bearer ${req.query.token}`;
    }
    auth("user")(req, res, next);
  },
  chatController.downloadAttachment,
);

// Get blocked users list
router.get("/blocked-users", auth("user"), chatController.getBlockedUsers);

// Block a user
router.post("/block", auth("user"), chatController.blockUser);

// Unblock a user
router.post("/unblock", auth("user"), chatController.unblockUser);

// Report a user
router.post("/report", auth("user"), chatController.reportUser);

// Inquire new chat
router.post(
  "/inquire/:recipientId",
  auth("user"),
  chatController.inquireNewChat,
);

// Hapus chat untuk user tertentu (tanpa menghapus chat untuk user lain)
router.delete(
  "/:chatId/participant",
  auth("user"),
  chatController.deleteChatForUser,
);

// Update Chat State (inbox, archive, etc.)
router.patch("/:chatId/state", auth("user"), chatController.updateChatState);

// Get all chats for a job
router.get("/job/:jobId", auth("user"), chatController.getJobChats);

module.exports = router;
