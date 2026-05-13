const ChatService = require("../services/chat.service"); // Import ChatService
const Report = require("../models/report.model");
const { Chat, User, UserSpace, AppliedJobs } = require("../models");
const reportService = require("../services/report.service");
const { uploadFileToS3 } = require("../middlewares/upload");
const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const DailyLimits = require("../models/dailyLimits.model");

// AWS SDK v3 setup for downloading
const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const getChatHistory = async (req, res) => {
  const { userId } = req.params; // ID of the other user in the chat
  const { currentUserId, jobId } = req.query; // ID of the current logged-in user

  try {
    let chat;
    if (jobId) {
      chat = await ChatService.getJobChatHistory(currentUserId, userId, jobId);
    } else {
      chat = await ChatService.getChatHistory(currentUserId, userId); // Use ChatService
    }

    if (!chat) {
      return res
        .status(404)
        .json({ success: false, message: "No chat history found" });
    }

    res.status(200).json({ success: true, data: chat });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

const blockUser = async (req, res) => {
  const userId = req.user && req.user.id; // get from token (blocker)
  const { userId: blockedUserId } = req.body; // user to be blocked sent from client

  try {
    if (!userId || !blockedUserId) {
      return res.status(400).json({
        success: false,
        message:
          "userId (from token) and userId (to be blocked) must be filled.",
      });
    }
    if (userId === blockedUserId) {
      return res
        .status(400)
        .json({ success: false, message: "Cannot block yourself." });
    }
    // Add blockedUserId to blockedUsers array of userId if it does not exist
    const user = await User.findById(userId);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found." });
    }
    const isAlreadyBlocked = user.blockedUsers.some(
      (id) => id.toString() === blockedUserId.toString(),
    );
    if (isAlreadyBlocked) {
      return res
        .status(400)
        .json({ success: false, message: "User already blocked." });
    }
    user.blockedUsers.push(blockedUserId);
    await user.save();
    res
      .status(200)
      .send({ success: true, message: "User blocked successfully." });
  } catch (error) {
    res.status(500).send({
      success: false,
      message: "Failed to block user.",
      error: error.message,
    });
  }
};

const reportUser = async (req, res) => {
  const {
    userId: reportedId,
    type = "user",
    reportedUserId,
    reason,
    details,
  } = req.body;
  const reporterId = (req.user && req.user.id) || req.body.reporterId; // pelapor

  try {
    if (!reportedId || !reporterId) {
      return res.status(400).json({
        success: false,
        message:
          "reportedId (ID yang dilaporkan) dan reporterId (pelapor) wajib diisi.",
      });
    }

    // Check daily report limit using simple count approach
    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);

      // Count reports made by this user today
      const existingReports = await reportService.countReports({
        userId: reporterId,
        createdAt: {
          $gte: todayStart,
          $lte: todayEnd,
        },
      });

      if (existingReports >= 10) {
        // Limit increased to 10 for testing/flexibility
        return res.status(429).json({
          success: false,
          message: `Daily report limit reached.`,
          limitReached: true,
        });
      }
    } catch (limitError) {
      console.error("Error checking report limits:", limitError);
      // If limit checking fails, still allow reporting
    }

    // Cek apakah sudah pernah direport oleh pelapor yang sama
    const alreadyReported = await reportService.findReport({
      userId: reporterId,
      type: type,
      reportedId: reportedId,
    });
    if (alreadyReported) {
      return res.status(400).json({
        success: false,
        message: "You have already reported this item.",
      });
    }

    await reportService.createReport({
      userId: reporterId,
      type: type,
      reportedId: reportedId,
      reportedUserId: reportedUserId || reportedId, // default ke reportedId jika tidak ada owner khusus
      reason: reason || "",
      description: details || "",
    });

    res
      .status(200)
      .send({ success: true, message: "Report submitted successfully." });
  } catch (error) {
    res.status(500).send({
      success: false,
      message: "Failed to submit report.",
      error: error.message,
    });
  }
};

const getUsers = async (req, res) => {
  try {
    const { role } = req.params;
    const { id } = req.user;
    const { jobId, type } = req.query; // Support jobId and type filter

    if (!id)
      res
        .status(200)
        .json({ success: false, message: "Nor User id found for chats" });

    // If jobId is provided, use getJobChats
    if (jobId) {
      // Logic for getJobChats?
      // Actually ChatService.getUsers logic was complex.
      // If we want to LIST APPLICANTS who have chatted, we might need a specific service method.
      // But for now, let's stick to standard behavior unless critical.
      // The frontend "Job Application Chat" page manages the list via Job applications.
      // So maybe we don't strictly need this update for getUsers if we don't list them via API.
    }

    const users = await ChatService.getUsers(role, id, type); // Use ChatService to get users
    console.log(users, "users in chat controller");
    res.status(200).json({ success: true, data: users });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
const sendMessage = async (req, res) => {
  let { recipientId } = req.params;
  let { message, attachments, type, jobId } = req.body;
  let { senderId } = req.query; // Assuming `authenticate` middleware sets req.user
  try {
    if (!message && (!attachments || attachments.length === 0)) {
      return res
        .status(400)
        .json({ error: "Message or attachments are required" });
    }

    const newMessage = await ChatService.saveMessage(
      senderId,
      recipientId,
      message,
      null,
      attachments,
      type || "direct",
      jobId || null,
    );

    return res.status(201).json(newMessage);
  } catch (error) {
    console.error("Error sending message:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

const deleteChatForUser = async (req, res) => {
  const userId = req.user && req.user.id;
  const { chatId } = req.params;
  console.log(
    "deleteChatForUser called with userId:",
    userId,
    "and chatId:",
    chatId,
  );
  try {
    if (!userId || !chatId) {
      return res.status(400).json({
        success: false,
        message: "userId (from token) and chatId must be provided.",
      });
    }
    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res
        .status(404)
        .json({ success: false, message: "Chat not found." });
    }
    // If user has already deleted, no need to do it again
    if (chat.deletedBy && chat.deletedBy.includes(userId)) {
      return res.status(200).json({
        success: true,
        message: "Chat already deleted for this user.",
      });
    }
    // Remove the chat permanently
    await Chat.deleteOne({ _id: chatId });
    res
      .status(200)
      .json({ success: true, message: "Chat permanently deleted." });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to delete chat permanently.",
      error: error.message,
    });
  }
};

const unblockUser = async (req, res) => {
  const userId = req.user && req.user.id; // get from token (unblocker)
  const { userId: unblockUserId } = req.body; // user to be unblocked sent from client

  try {
    if (!userId || !unblockUserId) {
      return res.status(400).json({
        success: false,
        message:
          "userId (from token) and userId (to be unblocked) must be filled.",
      });
    }
    if (userId === unblockUserId) {
      return res
        .status(400)
        .json({ success: false, message: "Cannot unblock yourself." });
    }
    // Remove unblockUserId from blockedUsers array of userId
    const user = await User.findById(userId);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found." });
    }
    const filteredBlockedUsers = user.blockedUsers.filter(
      (id) => id.toString() !== unblockUserId.toString(),
    );

    if (filteredBlockedUsers.length === user.blockedUsers.length) {
      return res
        .status(400)
        .json({ success: false, message: "User is not blocked." });
    }

    user.blockedUsers = filteredBlockedUsers;
    await user.save();
    res
      .status(200)
      .send({ success: true, message: "User unblocked successfully." });
  } catch (error) {
    res.status(500).send({
      success: false,
      message: "Failed to unblock user.",
      error: error.message,
    });
  }
};

const inquireNewChat = async (req, res) => {
  const senderId = req.user && req.user.id;
  const { recipientId } = req.params;
  const { message } = req.body;
  const direct =  true;
  if (!senderId || !recipientId) {
    return res.status(400).json({
      success: false,
      message: "senderId (from token) and recipientId are required.",
    });
  }
  try {
    // Sort participants to ensure uniqueness
    const sortedParticipants = [senderId, recipientId].sort();
    let chat = await Chat.findOne({
      participants: { $all: sortedParticipants },
    });

    // Rate Limiting Logic for "Strangers"
    if (chat) {
      // Check if recipient has ever replied
      const hasReplied = chat.messages.some(
        (m) => m.sender.toString() === recipientId.toString(),
      );

      if (!hasReplied) {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);

        const messagesToday = chat.messages.filter(
          (m) =>
            m.sender.toString() === senderId.toString() &&
            m.createdAt >= todayStart &&
            m.createdAt <= todayEnd,
        ).length;

        // If trying to send a new message and already at limit
        if (messagesToday >= 5) {
          return res.status(429).json({
            success: false,
            message:
              "You can only send 5 messages per day to a new connection until they reply.",
          });
        }
      }
    }

    if (!chat) {
      // Check daily chat creation limit using simple count approach
      try {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);

        // Count chats created by this user today
        const existingChats = await Chat.countDocuments({
          participants: senderId,
          createdAt: {
            $gte: todayStart,
            $lte: todayEnd,
          },
        });

        if (existingChats >= 20) {
          return res.status(429).json({
            success: false,
            message: `Daily chat creation limit reached. You can create ${
              20 - existingChats
            } more chats today.`,
            limitReached: true,
            remaining: Math.max(0, 20 - existingChats),
          });
        }
      } catch (limitError) {
        console.error("Error checking chat creation limits:", limitError);
        // If limit checking fails, still allow chat creation
      }

      // Buat chat baru dengan pesan pertama dan label inquire = true
      chat = new Chat({
        participants: sortedParticipants,
        inquiry: direct, // Set label inquire
        isRead: [senderId],
        messages: [
          {
            sender: senderId,
            text: message || "",
            isCard: false,
            createdAt: new Date(),
            inquire: direct, // label khusus
          },
        ],
      });
      await chat.save();

      return res.status(201).json({
        success: true,
        data: chat,
        message: "Chat created with inquire label.",
      });
    } else {
      // Jika chat sudah ada, tambahkan message baru dengan label inquire
      chat.messages.push({
        sender: senderId,
        text: message || "",
        isCard: false,
        createdAt: new Date(),
      });
      await chat.save();
      return res.status(200).json({
        success: true,
        data: chat,
        message: "Message added to existing chat.",
      });
    }
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to create or find chat.",
      error: error.message,
    });
  }
};

const uploadAttachment = async (req, res) => {
  try {
    if (!req.file) {
      return res
        .status(400)
        .json({ success: false, message: "No file uploaded" });
    }

    const userId = req.user && req.user.id;
    if (!userId) {
      return res
        .status(401)
        .json({ success: false, message: "User not authenticated" });
    }

    // Upload file to S3
    const uploadResult = await uploadFileToS3(req.file, userId);

    // Calculate expiration date (2 months from now)
    const expirationDate = new Date();
    expirationDate.setMonth(expirationDate.getMonth() + 2);

    const attachmentData = {
      filename: uploadResult.key,
      originalName: req.file.originalname,
      url: uploadResult.url,
      size: req.file.size,
      mimetype: req.file.mimetype,
      uploadedAt: new Date(),
      expiresAt: expirationDate,
    };

    res.status(200).json({
      success: true,
      message: "File uploaded successfully",
      data: attachmentData,
    });
  } catch (error) {
    console.error("Error uploading chat attachment:", error);
    res.status(500).json({
      success: false,
      message: "Failed to upload file",
      error: error.message,
    });
  }
};

const downloadAttachment = async (req, res) => {
  try {
    const { filename } = req.params;
    const userId = req.user && req.user.id;

    if (!userId) {
      return res
        .status(401)
        .json({ success: false, message: "User not authenticated" });
    }

    if (!filename) {
      return res
        .status(400)
        .json({ success: false, message: "Filename is required" });
    }

    // Find the attachment in chat messages to verify access and get original name
    const chat = await Chat.findOne({
      participants: userId,
      "messages.attachments.filename": filename,
    });

    if (!chat) {
      return res
        .status(404)
        .json({ success: false, message: "File not found or access denied" });
    }

    // Find the specific attachment
    let attachment = null;
    for (const message of chat.messages) {
      if (message.attachments) {
        attachment = message.attachments.find(
          (att) => att.filename === filename,
        );
        if (attachment) break;
      }
    }

    if (!attachment) {
      return res
        .status(404)
        .json({ success: false, message: "Attachment not found" });
    }

    // Check if attachment has expired
    if (attachment.expiresAt && attachment.expiresAt < new Date()) {
      return res.status(410).json({
        success: false,
        message: "File has expired and is no longer available",
      });
    }

    // Get file from S3 and stream it
    const getObjectParams = {
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: filename,
    };

    try {
      const command = new GetObjectCommand(getObjectParams);
      const s3Response = await s3.send(command);

      // Set headers for forced download
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${attachment.originalName}"`,
      );
      res.setHeader(
        "Content-Type",
        attachment.mimetype || "application/octet-stream",
      );
      res.setHeader(
        "Content-Length",
        attachment.size || s3Response.ContentLength,
      );
      res.setHeader("Cache-Control", "no-cache");

      // Stream the file content
      if (s3Response.Body) {
        s3Response.Body.pipe(res);
      } else {
        return res
          .status(404)
          .json({ success: false, message: "File content not found" });
      }
    } catch (s3Error) {
      console.error("S3 download error:", s3Error);
      return res
        .status(404)
        .json({ success: false, message: "File not found in storage" });
    }
  } catch (error) {
    console.error("Error downloading attachment:", error);
    res.status(500).json({
      success: false,
      message: "Failed to download file",
      error: error.message,
    });
  }
};

const getBlockedUsers = async (req, res) => {
  const userId = req.user && req.user.id;
  try {
    const user = await User.findById(userId).populate({
      path: "blockedUsers",
      select: "name profilePicture",
    });

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found." });
    }

    const blockedList = await Promise.all(
      user.blockedUsers.map(async (blockedUser) => {
        // Try to find more details in UserSpace
        const userSpace = await UserSpace.findOne({
          createdBy: blockedUser._id.toString(),
        });
        const name = userSpace
          ? `${userSpace.firstName || ""} ${userSpace.lastName || ""}`.trim()
          : blockedUser.name;
        const avatar = userSpace ? userSpace.profilePicture : null;

        return {
          id: blockedUser._id,
          name: name || "Unknown",
          avatar: avatar || blockedUser.profilePicture || null,
        };
      }),
    );

    res.status(200).json({ success: true, data: blockedList });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to get blocked users.",
      error: error.message,
    });
  }
};

const updateChatState = async (req, res) => {
  const userId = req.user && req.user.id;
  const { chatId } = req.params;
  const { status } = req.body; // 'inbox', 'archive', 'shortlist', 'deleted'

  try {
    if (!userId || !chatId || !status) {
      return res.status(400).json({
        success: false,
        message: "userId, chatId, and status must be provided.",
      });
    }

    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res
        .status(404)
        .json({ success: false, message: "Chat not found." });
    }

    // Hard Delete Logic if status is 'deleted'
    if (status === "deleted") {
      await Chat.deleteOne({ _id: chatId });

      // Also delete the AppliedJob
      // Using chat.jobId and finding which participant created it
      if (chat.jobId) {
        await AppliedJobs.deleteOne({
          jobId: chat.jobId,
          createdBy: { $in: chat.participants },
        });
      }

      return res.status(200).json({
        success: true,
        message: "Chat and application deleted permanently.",
      });
    }

    // Find state for user
    const stateIndex = chat.states.findIndex(
      (s) => s.user.toString() === userId.toString(),
    );

    if (stateIndex > -1) {
      chat.states[stateIndex].status = status;
    } else {
      chat.states.push({ user: userId, status });
    }

    // Since we hard delete on 'deleted', we don't need soft delete logic here anymore for 'deleted' status
    // But we might want to keep 'deletedBy' cleanup if we ever restore?
    // Actually, since we return above, this part is for non-deleted statuses.
    // Ensure we clean up deletedBy if it was previously soft-deleted (though hard delete makes this moot for that chat)
    // But if we are MOVING from 'deleted' (which shouldn't exist if hard deleted) to 'inbox', it implies logic change.
    // Assuming 'status' here is valid for update (inbox, archive, shortlist).

    // Remove from deletedBy if it exists (restoring context if simple update)
    if (chat.deletedBy && chat.deletedBy.length > 0) {
      chat.deletedBy = chat.deletedBy.filter((id) => id.toString() !== userId);
    }

    await chat.save();
    res
      .status(200)
      .json({ success: true, message: "Chat state updated successfully." });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to update chat state.",
      error: error.message,
    });
  }
};

const getJobChats = async (req, res) => {
  const { jobId } = req.params;
  try {
    const chats = await ChatService.getJobChats(jobId);
    res.status(200).json({ success: true, data: chats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = {
  getChatHistory,
  blockUser,
  reportUser,
  getUsers,
  sendMessage,
  unblockUser,
  deleteChatForUser,
  inquireNewChat,
  uploadAttachment,
  downloadAttachment,
  getBlockedUsers,
  updateChatState,
  getJobChats,
};
