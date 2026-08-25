const ContactUs = require('../models/contactUs.model');
const httpStatus = require('http-status');
const { emailService } = require('../services');

const getAllContactUs = async (req, res) => {
  // Only allow admin
  if (!req.user || req.user.role !== 'admin') {
    return res.status(httpStatus.FORBIDDEN).json({ message: 'Forbidden: Admins only' });
  }
  const contacts = await ContactUs.find().sort({ createdAt: -1 });
  return res.status(200).json(contacts);
};

const updateContactStatus = async (req, res) => {
  if (!req.user || req.user.role !== 'admin') return res.status(httpStatus.FORBIDDEN).json({ message: 'Forbidden: Admins only' });
  const allowed = ['open', 'in_progress', 'resolved'];
  if (!allowed.includes(req.body.status)) return res.status(httpStatus.BAD_REQUEST).json({ message: 'Invalid support request status.' });
  const contact = await ContactUs.findByIdAndUpdate(req.params.contactId, {
    status: req.body.status,
    resolvedAt: req.body.status === 'resolved' ? new Date() : null,
  }, { new: true, runValidators: true });
  if (!contact) return res.status(httpStatus.NOT_FOUND).json({ message: 'Support request not found.' });
  return res.status(httpStatus.OK).json(contact);
};

const replyToContact = async (req, res) => {
  if (!req.user || req.user.role !== 'admin') return res.status(httpStatus.FORBIDDEN).json({ message: 'Forbidden: Admins only' });
  const message = String(req.body.message || '').trim();
  if (!message || message.length > 5000) return res.status(httpStatus.BAD_REQUEST).json({ message: 'Reply must contain between 1 and 5000 characters.' });
  const contact = await ContactUs.findById(req.params.contactId);
  if (!contact) return res.status(httpStatus.NOT_FOUND).json({ message: 'Support request not found.' });
  const subject = `Re: ${contact.type || 'Your Intelligent Hiring support request'}`;
  const safeHtml = message.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character]).replace(/\n/g, '<br />');
  await emailService.sendEmail(contact.email, subject, message, `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#1e293b"><p>${safeHtml}</p><hr style="border:0;border-top:1px solid #e2e8f0;margin:24px 0"><p style="font-size:12px;color:#64748b">Intelligent Hiring Support</p></div>`);
  contact.replies.push({ message, sentBy: req.user.id });
  contact.status = req.body.resolve === false ? 'in_progress' : 'resolved';
  contact.resolvedAt = contact.status === 'resolved' ? new Date() : null;
  await contact.save();
  return res.status(httpStatus.OK).json(contact);
};

const deleteContact = async (req, res) => {
  if (!req.user || req.user.role !== 'admin') return res.status(httpStatus.FORBIDDEN).json({ message: 'Forbidden: Admins only' });
  const contact = await ContactUs.findByIdAndDelete(req.params.contactId);
  if (!contact) return res.status(httpStatus.NOT_FOUND).json({ message: 'Support request not found.' });
  return res.status(httpStatus.OK).json({ success: true, message: 'Support request deleted successfully' });
};

module.exports = {
  getAllContactUs,
  updateContactStatus,
  replyToContact,
  deleteContact,
};
