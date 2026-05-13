const httpStatus = require("http-status");
const {
  Job,
  AppliedJobs,
  UserSpace,
  User,
  Purchase,
  Chat,
} = require("../models");
const ApiError = require("../utils/ApiError");

/**
 * Create a job
 * @param {Object} body
 * @returns {Promise<Job>}
 */
const postJob = async (body) => {
  // For test accounts (virtual users), randomize project posted time within last 14 days
  let randomizedCreatedAt = null;
  try {
    if (body && body.createdBy) {
      const creator = await User.findById(body.createdBy)
        .select("testAccount")
        .lean();
      if (creator && creator.testAccount) {
        const maxDays = 14;
        const offsetMs = Math.floor(
          Math.random() * maxDays * 24 * 60 * 60 * 1000,
        );
        randomizedCreatedAt = new Date(Date.now() - offsetMs);
      }
    }
  } catch (_) {
    // If lookup fails, fall back to default timestamps
  }

  // Set default status to 'inreview'
  const jobData = {
    ...body,
    status: "active",
    // Expires 20 days after "posted time" (randomized for test accounts)
    expiresAt: new Date(
      (randomizedCreatedAt ? randomizedCreatedAt.getTime() : Date.now()) +
        20 * 24 * 60 * 60 * 1000,
    ),
    activePeriod: 20,
    isFreeExtensionUsed: false,
  };

  if (randomizedCreatedAt) {
    jobData.createdOn = randomizedCreatedAt;
    jobData.createdAt = randomizedCreatedAt;
    jobData.updatedAt = randomizedCreatedAt;
  }

  console.log("Job data being saved:", jobData);
  console.log("Position in job data:", jobData.position);

  const createdJob = await Job.create(jobData);
  console.log("Created job position:", createdJob.position);

  // If paymentId exists, record the purchase
  if (jobData.paymentId) {
    try {
      await Purchase.create({
        user: createdJob.createdBy, // Assuming createdBy is userId
        type: "project",
        projectId: createdJob.id,
        amount: 50, // Fixed amount for project creation
        currency: "USD",
        paymentMethod: "paypal",
        transactionId: jobData.paymentId,
        status: "completed",
        savePaymentInfo: false,
      });
      console.log(`✅ Recorded purchase for project ${createdJob.id}`);
    } catch (error) {
      console.error(
        `❌ Failed to record purchase for project ${createdJob.id}:`,
        error,
      );
      // We don't fail the job creation if purchase recording fails, but we log it.
      // In a stricter system, you might want to transaction this or handle differently.
    }
  }

  return createdJob;
};

/**
 * Query for music box
 * @param {Object} filter - Mongo filter
 * @param {Object} options - Query options
 * @param {string} [options.sortBy] - Sort option in the format: sortField:(desc|asc)
 * @param {number} [options.limit] - Maximum number of results per page (default = 10)
 * @param {number} [options.page] - Current page (default = 1)
 * @returns {Promise<QueryResult>}
 */
const queryJobs = async (filter, options) => {
  const jobs = await Job.paginate(filter, options);
  return jobs;
};

const getJobs = async (page, limit) => {
  const skip = (page - 1) * limit;

  const jobs = await Job.find()
    .select(
      "applicantName applicantAvata status createdOn applicantBackgroundImage applicantSelectedSongs budget category createdAt createdBy cultureArea description isHaveLyric id lyricLanguage musicUse preferredLocation projectTitle timeFrame savedBy position designCategory designSubcategory jobType applications",
    )
    .skip(skip)
    .limit(limit)
    .lean();
  console.log("Jobs:", jobs);
  console.log("First job position:", jobs[0]?.position);
  // Ambil semua userId unik dari createdBy
  const userIds = [...new Set(jobs.map((job) => job.createdBy))];

  // Ambil semua userSpace terkait
  const userSpaces = await UserSpace.find({
    createdBy: { $in: userIds },
  }).lean();
  const userSpaceMap = {};
  userSpaces.forEach((u) => {
    userSpaceMap[u.createdBy?.toString()] = u;
  });

  // Gabungkan userSpace ke setiap job
  const jobsWithUserSpace = jobs.map((job) => ({
    ...job,
    id: job._id?.toString(),
    userSpace: userSpaceMap[job.createdBy?.toString()] || null,
  }));

  const total = await Job.countDocuments();

  return {
    jobs: jobsWithUserSpace,
    currentPage: page,
    totalPages: Math.ceil(total / limit),
    totalJobs: total,
  };
};

/**
 * Get job by id
 * @param {ObjectId} id
 * @returns {Promise<Job>}
 */
const getJobById = async (id) => {
  const job = await Job.findById(id).lean();
  if (!job) return null;

  const userSpace = await UserSpace.findOne({
    createdBy: job.createdBy,
  }).lean();
  return {
    ...job,
    id: job._id?.toString(),
    userSpace: userSpace || null,
  };
};

const ChatService = require("./chat.service");
const userStatsService = require("./userStats.service");
const ShareMusicCreation = require("../models/shareMusicCreation.model");

/**
 * Apply a job
 * @param {Object} body
 * @returns {Promise<AppliedJobs>}
 */
const applyJob = async (body) => {
  const application = await AppliedJobs.create(body);

  // Create chat for job application
  try {
    const job = await Job.findById(body.jobId);
    if (job) {
      const applicantIdStr =
        typeof body.createdBy === "string"
          ? body.createdBy
          : body.createdBy?.toString?.();

      // Fetch Applicant Data for Card
      const applicant = await User.findById(body.createdBy).lean();
      const userSpace = await UserSpace.findOne({
        createdBy: applicantIdStr,
      }).lean();

      // Top 3 most-liked works (ShareMusicCreation) with normalized fields for the card
      const popularWorksRaw = applicantIdStr
        ? await ShareMusicCreation.aggregate([
            { $match: { createdBy: applicantIdStr } },
            {
              $project: {
                _id: 1,
                title: 1,
                songName: "$title",
                workImages: 1,
                likesCount: { $size: { $ifNull: ["$likes", []] } },
                createdAt: 1,
              },
            },
            { $sort: { likesCount: -1, createdAt: -1 } },
            { $limit: 3 },
          ])
        : [];

      const popularWorks = (popularWorksRaw || []).map((w) => ({
        _id: w._id,
        title: w.title,
        songName: w.songName || w.title,
        thumbnailUrl:
          Array.isArray(w.workImages) && w.workImages.length > 0
            ? w.workImages[0]
            : null,
        // Backward compatibility: existing frontend reads workImages?.[0]
        workImages:
          Array.isArray(w.workImages) && w.workImages.length > 0
            ? [w.workImages[0]]
            : [],
        likesCount: w.likesCount || 0,
      }));

      const totalLikes = await userStatsService.calculateTotalLikes(body.createdBy);

      const fullName = userSpace
        ? `${userSpace.firstName || ""} ${userSpace.lastName || ""}`.trim()
        : applicant?.name;

      const cardData = {
        type: "jobApplication",
        jobId: body.jobId,
        musicIds: body.musicIds || [],
        applicant: {
          id: applicant._id,
          name: fullName,
          profilePicture: userSpace?.profilePicture || applicant?.profilePicture,
          myServices: userSpace?.myServices || [],
          country: userSpace?.country || userSpace?.address?.split(",")[0],
          city: userSpace?.city,
          profileIntroduction: userSpace?.aboutMe || "",
          totalLikes,
          totalCollect: userSpace?.totalCollect || 0,
          creationOccupation: userSpace?.creationOccupation || [],
          popularWorks,
          coverUrl: userSpace?.coverUrl,
          aboutMe: userSpace?.aboutMe || "",
        },
      };

      await ChatService.createJobApplicationChat(
        body.createdBy, // applicant
        job.createdBy, // job poster
        body.jobId,
        body.message,
        cardData,
      );
    }
  } catch (error) {
    console.error("Failed to create job application chat:", error);
    // Don't fail the application if chat creation fails, but maybe log it
  }

  return application;
};

/**
 * Delete a job by id
 * @param {ObjectId} jobId
 * @returns {Promise<void>}
 */
const deleteJob = async (jobId) => {
  const job = await Job.findById(jobId);

  if (!job) {
    throw new ApiError(httpStatus.NOT_FOUND, "Job not found");
  }

  // Delete the job from the database
  await Job.findByIdAndDelete(jobId);

  // Delete associated applications
  await AppliedJobs.deleteMany({ jobId });

  // Delete associated chats
  await Chat.deleteMany({ jobId, type: "job_application" });
};

/**
 * Update a job by id
 * @param {ObjectId} jobId
 * @param {Object} updateData
 * @returns {Promise<Job>}
 */
const updateJob = async (jobId, updateData) => {
  const job = await Job.findById(jobId);

  if (!job) {
    throw new ApiError(httpStatus.NOT_FOUND, "Job not found");
  }

  Object.assign(job, updateData);
  await job.save(); // Save the updated job to the database

  return job;
};

const getMyJobs = async (userId, page, limit) => {
  const skip = (page - 1) * limit;

  const jobs = await Job.find({ createdBy: userId })
    .select(
      "applicantName applicantAvata status createdOn applicantBackgroundImage applicantSelectedSongs budget category createdAt createdBy cultureArea description isHaveLyric id lyricLanguage musicUse preferredLocation projectTitle timeFrame savedBy expiresAt isFreeExtensionUsed",
    )
    .skip(skip)
    .limit(limit)
    .lean();

  // Ambil userSpace untuk userId ini
  const userSpace = await UserSpace.findOne({ createdBy: userId }).lean();

  // Gabungkan userSpace ke setiap job
  const jobsWithUserSpace = jobs.map((job) => ({
    ...job,
    id: job._id?.toString(),
    userSpace: userSpace || null,
  }));

  const total = await Job.countDocuments({ createdBy: userId });

  return {
    jobs: jobsWithUserSpace,
    currentPage: page,
    totalPages: Math.ceil(total / limit),
    totalJobs: total,
  };
};

const getMyJobs2 = async (userId, page, limit) => {
  const skip = (page - 1) * limit;

  const jobs = await Job.find({ createdBy: userId })
    .select(
      "applicantName applicantAvata status createdOn applicantBackgroundImage applicantSelectedSongs budget category createdAt createdBy cultureArea description isHaveLyric id lyricLanguage musicUse preferredLocation projectTitle timeFrame savedBy designCategory",
    )
    .skip(skip)
    .limit(limit)
    .lean();

  // Ambil userSpace untuk userId ini
  const userSpace = await UserSpace.findOne({ createdBy: userId }).lean();

  // Untuk setiap job, ambil appliedJobs yang terkait
  const jobsWithAppliedJobs = await Promise.all(
    jobs.map(async (job) => {
      const appliedJobs = await AppliedJobs.find({ jobId: job._id }).lean();
      return {
        ...job,
        id: job._id?.toString(),
        userSpace: userSpace || null,
        appliedJobs: appliedJobs || [],
      };
    }),
  );

  const total = await Job.countDocuments({ createdBy: userId });

  return {
    jobs: jobsWithAppliedJobs,
    currentPage: page,
    totalPages: Math.ceil(total / limit),
    totalJobs: total,
  };
};

const changeJobStatus = async (jobId, status) => {
  // Validate status
  const validStatuses = ["active", "inactive", "inreview"];
  if (!validStatuses.includes(status)) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid status");
  }

  const job = await Job.findByIdAndUpdate(
    jobId,
    { status: status },
    { new: true },
  );

  if (!job) {
    throw new ApiError(httpStatus.NOT_FOUND, "Job not found");
  }

  return job;
};

const getAppliedJobs = async (userId) => {
  const appliedJobs = await AppliedJobs.find({ createdBy: userId });
  const jobIds = appliedJobs.map((job) => job.jobId);
  const jobs = await Job.find({ _id: { $in: jobIds } }).lean();

  // Ambil semua userId unik dari createdBy
  const creatorIds = [...new Set(jobs.map((job) => job.createdBy))];

  // Ambil semua userSpace terkait
  const userSpaces = await UserSpace.find({
    createdBy: { $in: creatorIds },
  }).lean();

  const userSpaceMap = {};
  userSpaces.forEach((u) => {
    userSpaceMap[u.createdBy?.toString()] = u;
  });

  // Gabungkan userSpace ke setiap job
  const jobsWithUserSpace = jobs.map((job) => ({
    ...job,
    id: job._id?.toString(),
    userSpace: userSpaceMap[job.createdBy?.toString()] || null,
  }));

  return jobsWithUserSpace;
};

const getApplicationByJobIdAndUserId = async (jobId, userId) => {
  const application = await AppliedJobs.findOne({ jobId, createdBy: userId });
  return application;
};

const getJobWithApplicants = async (jobId) => {
  const job = await Job.findById(jobId).lean();
  if (!job) {
    throw new ApiError(httpStatus.NOT_FOUND, "Job not found");
  }

  const applications = await AppliedJobs.find({ jobId: jobId })
    .populate({
      path: "createdBy",
      select: "name email profilePicture",
    })
    .lean();

  return {
    ...job,
    applications,
  };
};

/**
 * Extend job duration
 * @param {ObjectId} jobId
 * @param {string} type - 'free' or 'paid'
 * @returns {Promise<Job>}
 */
const extendJob = async (jobId, type, paymentId) => {
  const job = await Job.findById(jobId);
  if (!job) {
    throw new ApiError(httpStatus.NOT_FOUND, "Job not found");
  }

  if (type === "free") {
    if (job.isFreeExtensionUsed) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Free extension already used");
    }

    let currentExpiry = job.expiresAt ? new Date(job.expiresAt) : new Date();
    if (isNaN(currentExpiry.getTime())) {
      currentExpiry = new Date();
    }

    // Calculate new expiry
    let newExpiry = new Date(currentExpiry);
    if (newExpiry < new Date()) {
      newExpiry = new Date(); // Reset to now if expired
    }
    newExpiry.setDate(newExpiry.getDate() + 10);

    job.expiresAt = newExpiry;
    job.isFreeExtensionUsed = true;
    job.status = "active";
  } else if (type === "paid") {
    let currentExpiry = job.expiresAt ? new Date(job.expiresAt) : new Date();
    if (isNaN(currentExpiry.getTime())) {
      currentExpiry = new Date();
    }

    // Add 30 days
    let newExpiry = new Date(currentExpiry);
    if (newExpiry < new Date()) {
      newExpiry = new Date();
    }
    newExpiry.setDate(newExpiry.getDate() + 30);

    job.expiresAt = newExpiry;
    job.status = "active";

    // Record Purchase
    if (paymentId) {
      try {
        await Purchase.create({
          user: job.createdBy,
          type: "project_extension",
          projectId: job.id,
          amount: 50,
          currency: "USD",
          paymentMethod: "paypal",
          transactionId: paymentId,
          status: "completed",
          savePaymentInfo: false,
        });
        console.log(`✅ Recorded purchase for job extension ${job.id}`);
      } catch (error) {
        console.error(
          `❌ Failed to record purchase for job extension ${job.id}:`,
          error,
        );
      }
    }
  } else {
    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid extension type");
  }

  await job.save();
  return job;
};

module.exports = {
  postJob,
  queryJobs,
  getJobById,
  applyJob,
  deleteJob,
  updateJob,
  getJobs,
  getMyJobs,
  getMyJobs2,
  changeJobStatus,
  getAppliedJobs,
  getApplicationByJobIdAndUserId,
  getJobWithApplicants,
  extendJob,
};
