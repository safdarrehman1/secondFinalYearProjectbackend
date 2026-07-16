const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const SkillGapCreation = require('../models/skillGapCreation.model');

const createWork = catchAsync(async (req, res) => {
  const work = await SkillGapCreation.create({ ...req.body, createdBy: req.user.id });
  res.status(httpStatus.CREATED).send(work);
});

const getWorks = catchAsync(async (req, res) => {
  const works = await SkillGapCreation.find().sort({ createdAt: -1 }).lean();
  res.send(works);
});

const getUserWorks = catchAsync(async (req, res) => {
  const works = await SkillGapCreation.find({ createdBy: req.params.userId }).sort({ createdAt: -1 }).lean();
  res.send(works);
});

const getMyWorks = catchAsync(async (req, res) => {
  const works = await SkillGapCreation.find({ createdBy: req.user.id }).sort({ createdAt: -1 }).lean();
  res.send(works);
});

const getWork = catchAsync(async (req, res) => {
  const work = await SkillGapCreation.findById(req.params.id).lean();
  if (!work) throw new ApiError(httpStatus.NOT_FOUND, 'Project showcase not found');
  res.send(work);
});

const updateWork = catchAsync(async (req, res) => {
  const work = await SkillGapCreation.findOneAndUpdate(
    { _id: req.params.id, createdBy: req.user.id },
    req.body,
    { new: true, runValidators: true },
  );
  if (!work) throw new ApiError(httpStatus.NOT_FOUND, 'Work not found');
  res.send(work);
});

const deleteWork = catchAsync(async (req, res) => {
  const work = await SkillGapCreation.findOneAndDelete({ _id: req.params.id, createdBy: req.user.id });
  if (!work) throw new ApiError(httpStatus.NOT_FOUND, 'Work not found');
  res.send({ message: 'Work deleted successfully' });
});

module.exports = { createWork, getWorks, getUserWorks, getMyWorks, getWork, updateWork, deleteWork };
