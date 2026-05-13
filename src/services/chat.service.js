const { AppliedJobs, Order } = require("../models");
const { Chat } = require("../models"); // Import the Chat model
const mongoose = require("mongoose");

/**
 * Chat Service: Handles chat-related business logic.
 */
const ChatService = {
  /**
   * Get chat history between two users.
   *
   * @param {string} currentUserId - ID of the logged-in user.
   * @param {string} userId - ID of the other user in the chat.
   * @returns {Promise<Object>} - Chat document containing messages.
   */
  async getChatHistory(currentUserId, userId) {
    try {
      // Ensure currentUserId and userId are ObjectId type
      const currentUserObjId = mongoose.Types.ObjectId.isValid(currentUserId)
        ? new mongoose.Types.ObjectId(currentUserId)
        : currentUserId;
      const userObjId = mongoose.Types.ObjectId.isValid(userId)
        ? new mongoose.Types.ObjectId(userId)
        : userId;

      let chat;
      let retries = 3;
      while (retries > 0) {
        try {
          chat = await Chat.findOne({
            participants: { $all: [currentUserObjId, userObjId] },
          });
          if (!chat) {
            return { message: "Chat not found." };
          }

          // Update isRead: must have 2 users (sender & receiver), status only for user who reads
          const userIds = [currentUserObjId.toString(), userObjId.toString()];
          chat.isRead = chat.isRead.filter((id) =>
            userIds.includes(id.toString()),
          );
          if (
            !chat.isRead.find(
              (id) => id.toString() === currentUserObjId.toString(),
            )
          ) {
            chat.isRead.push(currentUserObjId);
          }

          // Mark messages from other user as read
          let hasChanges = false;
          chat.messages = chat.messages.map((msg) => {
            if (
              msg.sender.toString() !== currentUserObjId.toString() &&
              !msg.readby
            ) {
              if (msg.toObject) {
                msg = msg.toObject();
              }
              msg.readby = true;
              hasChanges = true;
            }
            return msg;
          });

          if (hasChanges || chat.isModified("isRead")) {
            chat.markModified("messages");
            await chat.save();
          }

          break; // Success, exit loop
        } catch (err) {
          if (err.name === "VersionError" && retries > 1) {
            retries--;
            console.log(
              `VersionError in getChatHistory, retrying... (${retries} left)`,
            );
            continue;
          }
          throw err;
        }
      }

      // Fetch orders related to this chat
      const orders = await Order.find({ chat_id: chat._id });
      if (orders) {
        return { chat, orders };
      }
      return chat;
    } catch (error) {
      console.error("Error fetching chat history:", error, error?.stack);
      throw new Error("Unable to fetch chat history.");
    }
  },

  // async getChatHistory(currentUserId, userId) {
  //   try {
  //     const chat = await Chat.findOne({
  //       participants: { $all: [currentUserId, userId] },
  //     }).select('messages');
  //     return chat;
  //   } catch (error) {
  //     console.error('Error fetching chat history:', error);
  //     throw new Error('Unable to fetch chat history.');
  //   }
  // },

  /**
   * Get chat by ID
   * @param {string} chatId - Chat ID
   * @returns {Promise<Object>} - Chat document
   */
  async getChatById(chatId) {
    try {
      const chat = await Chat.findById(chatId);
      return chat;
    } catch (error) {
      console.error("Error fetching chat by ID:", error);
      throw error;
    }
  },

  /**
   * Save a message in the chat between two participants.
   * Creates a new chat if it doesn't exist.
   *
   * @param {string} senderId - ID of the sender.
   * @param {string} recipientId - ID of the recipient.
   * @param {string} message - Message text.
   * @returns {Promise<Object>} - Updated chat document.
   */
  async saveMessage(
    senderId,
    recipientId,
    message,
    cardData = null,
    attachments = [],
    type = "direct",
    jobId = null,
  ) {
    try {
      console.log(recipientId, senderId, "id inside here ");
      console.log(
        "cardData received in saveMessage:",
        JSON.stringify(cardData, null, 2),
      );

      // Convert sender and recipient IDs to ObjectId
      const senderObjectId = new mongoose.Types.ObjectId(senderId);
      const recipientObjectId = new mongoose.Types.ObjectId(recipientId);

      // const card = message.split("||")[1] == "OrderRequestCard"

      console.log(senderObjectId, recipientObjectId, "id inside here ");
      // Sort participants to ensure consistency
      const sortedParticipants = [senderObjectId, recipientObjectId].sort();
      console.log("Sorted Participants:", sortedParticipants);

      // Attempt to find the chat (Single Thread Model: Find by participants only)
      const query = {
        participants: { $all: sortedParticipants },
      };

      // For job applications we need one thread per jobId as well
      if (type === "job_application" && jobId) {
        query.type = "job_application";
        query.jobId = jobId;
      }

      let chat = await Chat.findOne(query);

      if (!chat) {
        console.log("No existing chat found, creating a new one.");
        // If no chat exists, create one
        const newMessage = {
          sender: senderObjectId,
          text: message,
          isCard: cardData ? true : false,
          createdAt: new Date(),
          cardData: cardData || null, // Ensure cardData is stored
          attachments: attachments || [],
        };

        console.log(
          "Creating new chat with message:",
          JSON.stringify(newMessage, null, 2),
        );

        chat = new Chat({
          participants: sortedParticipants,
          messages: [newMessage],
          isRead: [senderObjectId], // Sender is immediately considered as read
          type: type,
          jobId: jobId || undefined,
        });
      } else {
        // Idempotency guard: avoid duplicate job application card messages
        if (
          type === "job_application" &&
          jobId &&
          cardData &&
          cardData.type === "jobApplication"
        ) {
          const alreadyHasCard = (chat.messages || []).some((m) => {
            const cd = m && m.cardData;
            return (
              cd &&
              cd.type === "jobApplication" &&
              cd.jobId &&
              cd.jobId.toString() === jobId.toString()
            );
          });
          if (alreadyHasCard) {
            return chat;
          }
        }

        // If chat exists, add the new message
        const newMessage = {
          sender: senderObjectId,
          text: message,
          isCard: cardData ? true : false,
          createdAt: new Date(),
          cardData: cardData || null, // Ensure cardData is stored
          attachments: attachments || [],
        };

        console.log("Adding new message:", JSON.stringify(newMessage, null, 2));
        // Update type and jobId if provided (Moving context)
        if (type === "job_application") {
          chat.type = type;
          chat.jobId = jobId;
        } else if (type === "direct") {
          // Optional: If explicitly setting to direct, we can clear jobId?
          // Depends on if we consider 'direct' as stripping the job context.
          // For now, let's allow updating to direct if passed explicit 'direct',
          // but keep jobId if flexible.
          // If we want "Single Thread" that changes based on latest, we should update.
          if (type) chat.type = type;
          if (type === "direct") chat.jobId = undefined;
        }

        chat.messages.push(newMessage);
        chat.isRead = [senderObjectId]; // Reset read status so recipient sees it as new
        // Logic inquiry: inquiry remains true if sender is same as first message sender
        if (chat.messages.length > 1 && chat.inquiry !== false) {
          const firstSender = chat.messages[0].sender.toString();
          if (senderObjectId.toString() !== firstSender) {
            chat.inquiry = false;
          }
        }
      }

      // Save the chat (whether new or updated)
      chat.markModified("messages"); // Ensure Mongoose detects changes to the messages array
      await chat.save();

      console.log(
        "Chat saved successfully. Last message:",
        JSON.stringify(chat.messages[chat.messages.length - 1], null, 2),
      );

      return chat;
    } catch (error) {
      console.error("Error saving message:", error);
      throw new Error("Unable to save message.");
    }
  },

  /**
   * Block a user in a chat.
   *
   * @param {string} userId - ID of the user performing the block.
   * @param {string} blockedUserId - ID of the user to be blocked.
   * @returns {Promise<void>}
   */
  async blockUser(userId, blockedUserId) {
    try {
      await Chat.updateMany(
        { participants: { $all: [userId, blockedUserId] } },
        { $addToSet: { blockedBy: userId } }, // Add the blocking user to the `blockedBy` array
      );
    } catch (error) {
      console.error("Error blocking user:", error);
      throw new Error("Unable to block user.");
    }
  },

  /**
   * Report a user in a chat.
   *
   * @param {string} userId - ID of the user reporting.
   * @param {string} reportedUserId - ID of the user being reported.
   * @returns {Promise<void>}
   */
  async reportUser(userId, reportedUserId) {
    try {
      await Chat.updateMany(
        { participants: { $all: [userId, reportedUserId] } },
        { $addToSet: { reportedBy: userId } }, // Add the reporting user to the `reportedBy` array
      );
    } catch (error) {
      console.error("Error reporting user:", error);
      throw new Error("Unable to report user.");
    }
  },

  /**
   * Mark all messages as read in a chat for a user.
   *
   * @param {string} chatId - ID of the chat.
   * @param {string} userId - ID of the user marking messages as read.
   * @returns {Promise<void>}
   */
  async markMessagesAsRead(chatId, userId) {
    try {
      const chat = await Chat.findById(chatId);
      if (!chat) {
        throw new Error("Chat not found.");
      }

      chat.messages.forEach((message) => {
        if (message.sender !== userId && !message.read) {
          message.read = true; // Mark the message as read
        }
      });

      await chat.save();
    } catch (error) {
      console.error("Error marking messages as read:", error);
      throw new Error("Unable to mark messages as read.");
    }
  },

  async getUsers(role, userId, type) {
    try {
      if (type === "job_application") {
        // For job applications tab: show ALL job_application chats where user is a participant
        // This covers both: recruiter (received applications) and applicant (sent applications)
        const chats = await Chat.find({
          type: "job_application",
          participants: mongoose.Types.ObjectId(userId),
          deletedBy: { $ne: mongoose.Types.ObjectId(userId) },
        }).populate([
          { path: "participants", select: "name email" },
          { path: "jobId", select: "projectTitle createdBy" },
        ]);

        const users = await Promise.all(
          chats.map(async (chat) => {
            const otherUser = chat.participants.find(
              (u) => u._id.toString() !== userId.toString(),
            );
            const lastMessage =
              chat.messages && chat.messages.length > 0
                ? chat.messages[chat.messages.length - 1]
                : null;
            let avatar = null;
            let fullName = null;
            if (otherUser) {
              const userSpace = await mongoose
                .model("UserSpace")
                .findOne({ createdBy: otherUser._id.toString() });
              if (userSpace) {
                avatar = userSpace.profilePicture;
                fullName = `${userSpace.firstName || ""} ${userSpace.lastName || ""}`.trim();
              }
            }
            return {
              id: otherUser?._id,
              name: fullName ?? otherUser?.name,
              email: otherUser?.email,
              avatar: avatar ?? "",
              chatId: chat._id,
              lastMessage,
              jobTitle: chat.jobId?.projectTitle,
              jobId: chat.jobId?._id,
              inquiry: chat.inquiry || false,
            };
          }),
        );
        return users.filter((u) => u.id);
      } else {
        // All Messages: exclude job_application chats
        const query = {
          participants: mongoose.Types.ObjectId(userId),
          deletedBy: { $ne: mongoose.Types.ObjectId(userId) },
          type: { $ne: "job_application" },
        };

        const chats = await Chat.find(query).populate([
          {
            path: "participants",
            select: "name email",
          },
          {
            path: "jobId",
            select: "projectTitle createdBy",
          },
        ]);

        // Find all users who already have a job_application chat with this user
        // Those users should only appear in Job Applications tab, not All Messages
        const jobAppChats = await Chat.find({
          type: "job_application",
          participants: mongoose.Types.ObjectId(userId),
        }).select("participants");

        const jobAppPartnerIds = new Set(
          jobAppChats.flatMap((c) =>
            c.participants
              .map((p) => p.toString())
              .filter((p) => p !== userId.toString()),
          ),
        );

        // Exclude direct chats with users who already have a job_application chat
        const filteredChats = chats.filter((chat) => {
          const otherUser = chat.participants.find(
            (u) => u._id.toString() !== userId.toString(),
          );
          if (!otherUser) return false;
          return !jobAppPartnerIds.has(otherUser._id.toString());
        });

        // Get other user from each chat
        const users = await Promise.all(
          filteredChats.map(async (chat) => {
            const otherUser = chat.participants.find(
              (u) => u._id.toString() !== userId.toString(),
            );
            const lastMessage =
              chat.messages && chat.messages.length > 0
                ? chat.messages[chat.messages.length - 1]
                : null;
            let avatar = null;
            let fullName = null;
            if (otherUser) {
              // Find userSpace based on createdBy = otherUser._id
              const userSpace = await mongoose
                .model("UserSpace")
                .findOne({ createdBy: otherUser._id.toString() });
              if (userSpace) {
                avatar = userSpace.profilePicture;
                fullName = userSpace.firstName + " " + userSpace.lastName; // Assuming userSpace has firstName and lastName
              }
            }
            let userObj = {
              id: otherUser?._id,
              name: fullName ?? otherUser?.name,
              email: otherUser?.email,
              avatar:
                avatar ??
                "https://musicimagevideos.s3.ap-southeast-2.amazonaws.com/music/others/685faf70bfcdd925769fa07a/1751101939604-Screen%20Shot%202025-06-28%20at%2016.12.06.png",
              chatId: chat._id,
              lastMessage,
              jobTitle: chat.jobId?.projectTitle,
              jobId: chat.jobId?._id,
              inquiry: chat.inquiry || false,
            };

            // Logic to determine if it should be shown as an "Inquiry" for THIS user
            if (chat.inquiry) {
              const firstMessage = chat.messages && chat.messages[0];
              if (
                firstMessage &&
                firstMessage.sender.toString() === userId.toString()
              ) {
                // Current user is the sender/initiator
                userObj.inquiry = false;
              } else {
                // Current user is the recipient
                userObj.inquiry = true;
              }
            }

            return userObj;
          }),
        );
        return users.filter((u) => u.id);
      }
    } catch (error) {
      console.error("Error fetching users:", error);
      throw new Error("Unable to fetch users.");
    }
  },

  /**
   * Delete order request messages with specific orderId from cardData to reduce clutter
   * Only deletes messages with type 'order_request', not acceptance/decline messages
   *
   * @param {string} orderId - Order ID to delete order request messages for
   * @returns {Promise<Object>} - Result of the deletion operation
   */
  async deleteOrderRequestMessagesByOrderId(orderId) {
    try {
      // Find all chats that have order request messages with the specific orderId in cardData
      const result = await Chat.updateMany(
        {
          "messages.cardData.orderId": orderId,
          "messages.cardData.type": "order_request",
        },
        {
          $pull: {
            messages: {
              "cardData.orderId": orderId,
              "cardData.type": "order_request",
            },
          },
        },
      );

      console.log(
        `Deleted ${result.modifiedCount} order request messages for orderId: ${orderId}`,
      );
      return {
        success: true,
        modifiedCount: result.modifiedCount,
        message: `Deleted order request messages for orderId: ${orderId}`,
      };
    } catch (error) {
      console.error("Error deleting order request messages by orderId:", error);
      throw new Error("Unable to delete order request messages by orderId.");
    }
  },

  /**
   * Create a job application chat
   */
  async createJobApplicationChat(
    senderId,
    recipientId,
    jobId,
    message,
    cardData = null,
  ) {
    try {
      if (!mongoose.Types.ObjectId.isValid(jobId)) {
        throw new Error("Invalid Job ID");
      }
      return await this.saveMessage(
        senderId,
        recipientId,
        message,
        cardData,
        [],
        "job_application",
        jobId,
      );
    } catch (error) {
      console.error("Error creating job application chat:", error);
      throw error;
    }
  },

  /**
   * Get chat history for a specific job application
   */
  async getJobChatHistory(currentUserId, userId, jobId) {
    try {
      const currentUserObjId = new mongoose.Types.ObjectId(currentUserId);
      const userObjId = new mongoose.Types.ObjectId(userId);

      const chat = await Chat.findOne({
        participants: { $all: [currentUserObjId, userObjId] },
        type: "job_application",
        jobId: jobId,
      });

      if (!chat) return null; // Or return empty object?

      // Mark as read logic (simplified reuse)
      const userIds = [currentUserObjId.toString(), userObjId.toString()];
      if (
        !chat.isRead.find((id) => id.toString() === currentUserObjId.toString())
      ) {
        chat.isRead.push(currentUserObjId);
        await chat.save();
      }

      return { chat, orders: [] }; // Wrap to match getChatHistory output structure
    } catch (error) {
      console.error("Error fetching job chat history:", error);
      throw error;
    }
  },

  /**
   * Get all chats for a specific job (for the recruiter view)
   */
  async getJobChats(jobId) {
    try {
      const jobObjectId = mongoose.Types.ObjectId.isValid(jobId)
        ? new mongoose.Types.ObjectId(jobId)
        : null;

      // Primary: find chats with jobId field set
      let chats = jobObjectId
        ? await Chat.find({
            type: "job_application",
            jobId: jobObjectId,
          }).populate({
            path: "participants",
            select: "name email profilePicture",
          })
        : [];

      // Fallback: if no chats found by jobId, find via AppliedJobs applicants
      if (chats.length === 0 && jobObjectId) {
        const job = await mongoose.model("Job").findById(jobObjectId).lean();
        const applications = await AppliedJobs.find({ jobId: jobObjectId }).lean();
        if (job && applications.length > 0) {
          const recruiterObjId = mongoose.Types.ObjectId.isValid(job.createdBy)
            ? new mongoose.Types.ObjectId(job.createdBy)
            : job.createdBy;
          const applicantObjIds = applications.map((a) =>
            mongoose.Types.ObjectId.isValid(a.createdBy)
              ? new mongoose.Types.ObjectId(a.createdBy)
              : a.createdBy,
          );

          // Find ANY chat (direct or job_application) between recruiter and any applicant
          chats = await Chat.find({
            participants: {
              $all: [recruiterObjId],
              $in: applicantObjIds,
            },
          }).populate({
            path: "participants",
            select: "name email profilePicture",
          });

          // Backfill type and jobId so future queries work correctly
          if (chats.length > 0) {
            await Chat.updateMany(
              { _id: { $in: chats.map((c) => c._id) } },
              { $set: { type: "job_application", jobId: jobObjectId } },
            );
            // Update in-memory objects too
            chats = chats.map((c) => {
              c.type = "job_application";
              c.jobId = jobObjectId;
              return c;
            });
          }
        }
      }

      return chats;
    } catch (error) {
      console.error("Error fetching job chats:", error);
      throw error;
    }
  },

  // async sendMessage (params){
  //   try {
  //     const { senderId, recipientId, message } = params;
  //     const savedMessage = await ChatService.saveMessage(senderId, recipientId, message);
  //     res.status(201).json(savedMessage);
  //   } catch (error) {
  //     console.error('Error sending message:', error);
  //     res.status(500).json({ error: 'Unable to send message.' });
  //   }
  // }
};

module.exports = ChatService;
