const httpStatus = require('http-status');
const ApiError = require('../../utils/ApiError');
const catchAsync = require('../../utils/catchAsync');
const AppliedJobs = require('../../models/appliedJobs.model');
const Job = require('../../models/job.model');
const Questionnaire = require('./questionnaire.model');
const screeningService = require('./screening.service');
const ChatService = require('../../services/chat.service');
const User = require('../../models/user.model');
const UserSpace = require('../../models/userSpace.model');
const userStatsService = require('../../services/userStats.service');

const ownedApplication = async (applicationId, userId) => {
  const application = await AppliedJobs.findById(applicationId);
  if (!application) throw new ApiError(httpStatus.NOT_FOUND, 'Application not found');
  if (application.createdBy.toString() !== userId.toString()) {
    throw new ApiError(httpStatus.FORBIDDEN, 'You cannot access this application test');
  }
  return application;
};

const generateQuestionnaire = catchAsync(async (req, res) => {
  const application = await ownedApplication(req.params.id, req.user.id);
  if (application.disqualifiedReason) throw new ApiError(httpStatus.CONFLICT, 'Application test has ended');
  let questionnaire = await Questionnaire.findOne({ applicationId: application._id });
  if (!questionnaire || questionnaire.questions.length !== 8) {
    try {
      const job = await Job.findById(application.jobId).lean();
      questionnaire = await screeningService.generateQuestionnaire(application, job, req.user.id);
      application.screeningStatus = 'test_pending';
      await application.save();
    } catch (error) {
      console.warn(`Questionnaire AI unavailable for ${application._id}: ${error.message}`);
      return res.status(httpStatus.SERVICE_UNAVAILABLE).send({
        success: false, manualReview: true,
        message: 'The AI test is temporarily unavailable. Your application remains active for manual review.',
      });
    }
  }
  return res.send(screeningService.publicQuestionnaire(questionnaire));
});

const submitQuestionnaire = catchAsync(async (req, res) => {
  const application = await ownedApplication(req.params.id, req.user.id);
  if (application.disqualifiedReason) throw new ApiError(httpStatus.CONFLICT, 'Application was disqualified');
  const questionnaire = await Questionnaire.findOne({ applicationId: application._id });
  if (!questionnaire) throw new ApiError(httpStatus.NOT_FOUND, 'Questionnaire not found');
  const score = await screeningService.submitAnswers(questionnaire, req.body.answers);
  application.questionnaireScore = score;
  application.qualified = score >= 60;
  application.screeningStatus = 'test_submitted';
  await application.save();
  if (application.qualified) {
    try {
      const job = await Job.findById(application.jobId).lean();
      const applicant = await User.findById(application.createdBy).lean();
      const userSpace = await UserSpace.findOne({ createdBy: application.createdBy }).lean();
      const totalLikes = await userStatsService.calculateTotalLikes(application.createdBy);
      const fullName = userSpace
        ? `${userSpace.firstName || ''} ${userSpace.lastName || ''}`.trim()
        : applicant?.name;
      const cardData = {
        type: 'jobApplication',
        jobId: application.jobId,
        applicant: {
          id: applicant?._id,
          name: fullName,
          profilePicture: userSpace?.profilePicture || applicant?.profilePicture,
          myServices: userSpace?.myServices || [],
          country: userSpace?.country || userSpace?.address?.split(',')[0],
          city: userSpace?.city,
          profileIntroduction: userSpace?.aboutMe || '',
          totalLikes,
          totalCollect: userSpace?.totalCollect || 0,
          creationOccupation: userSpace?.creationOccupation || [],
          coverUrl: userSpace?.coverUrl,
          aboutMe: userSpace?.aboutMe || '',
        },
      };
      const file = application.resumeFile;
      const attachments = file?.url ? [{
        filename: file.key || file.originalName, originalName: file.originalName,
        url: file.url, size: file.size, mimetype: file.mimetype,
      }] : [];
      await ChatService.saveMessage(
        application.createdBy, job.createdBy, application.message, cardData,
        attachments, 'job_application', application.jobId,
      );
    } catch (error) {
      console.warn(`Qualified applicant handoff failed for ${application._id}: ${error.message}`);
    }
  }
  return res.send({ score, qualified: application.qualified });
});

const disqualify = catchAsync(async (req, res) => {
  const application = await ownedApplication(req.params.id, req.user.id);
  if (application.screeningStatus !== 'test_submitted') {
    application.disqualifiedReason = 'tab_switch';
    application.qualified = false;
    application.questionnaireScore = 0;
    application.screeningStatus = 'disqualified';
    await application.save();
  }
  return res.send({ disqualified: Boolean(application.disqualifiedReason), reason: application.disqualifiedReason });
});

const getApplicants = catchAsync(async (req, res) => {
  const job = await Job.findById(req.params.jobId).lean();
  if (!job) throw new ApiError(httpStatus.NOT_FOUND, 'Job not found');
  if (job.createdBy.toString() !== req.user.id.toString()) throw new ApiError(httpStatus.FORBIDDEN, 'Only the job poster can view applicants');
  const filter = { jobId: job._id };
  if (String(req.query.qualified) === 'true') filter.qualified = true;
  const applicants = await AppliedJobs.find(filter)
    .populate({ path: 'createdBy', select: 'name email profilePicture' })
    .sort({ questionnaireScore: -1, createdAt: -1 })
    .lean();
  return res.send(applicants);
});

module.exports = { generateQuestionnaire, submitQuestionnaire, disqualify, getApplicants };
