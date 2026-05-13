const { Resend } = require("resend");
const config = require("../config/config");
const logger = require("../config/logger");

const resend = new Resend(config.email.resendApiKey);

/**
 * Send an email
 * @param {string} to
 * @param {string} subject
 * @param {string} text
 * @param {string} html
 * @returns {Promise}
 */
const sendEmail = async (to, subject, text, html) => {
  try {
    const { data, error } = await resend.emails.send({
      from: config.email.from,
      to,
      subject,
      text,
      html,
    });

    if (error) {
      logger.error("Error sending email:", error);
      throw new Error(error.message);
    }

    logger.info("Email sent successfully:", data);
    return data;
  } catch (error) {
    logger.error("Error sending email:", error);
    throw error;
  }
};

/**
 * Send reset password email
 * @param {string} to
 * @param {string} token
 * @returns {Promise}
 */
const sendResetPasswordEmail = async (to, token) => {
  const subject = "Reset password";
  // replace this url with the link to the reset password page of your front-end app
  const resetPasswordUrl = `http://link-to-app/reset-password?token=${token}`;
  const text = `Dear user,
To reset your password, click on this link: ${resetPasswordUrl}
If you did not request any password resets, then ignore this email.`;
  await sendEmail(to, subject, text);
};

/**
 * Send reset password OTP email
 * @param {string} to
 * @param {string} otp
 * @returns {Promise}
 */
const sendResetPasswordOTPEmail = async (to, otp) => {
  const subject = "Reset Password OTP";
  const text = `Dear user,
Your OTP to reset your password is: ${otp}
This OTP is valid for 10 minutes.
If you did not request a password reset, please ignore this email.`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
      <h2 style="color: #333;">Password Reset OTP</h2>
      <p style="color: #555;">You requested a password reset. Use the OTP below to proceed:</p>
      <div style="background-color: #f4f4f4; padding: 15px; border-radius: 5px; text-align: center; margin: 20px 0;">
        <span style="font-size: 24px; font-weight: bold; letter-spacing: 5px; color: #333;">${otp}</span>
      </div>
      <p style="color: #555; font-size: 14px;">This OTP is valid for 10 minutes.</p>
      <p style="color: #888; font-size: 12px; margin-top: 20px;">If you did not request this, please ignore this email.</p>
    </div>
  `;
  await sendEmail(to, subject, text, html);
};

/**
 * Send verification email
 * @param {string} to
 * @param {string} token
 * @returns {Promise}
 */
const sendVerificationEmail = async (to, token) => {
  const subject = "Email Verification";
  const verificationEmailUrl = `https://api.pallavin.com/v1/auth/verify-email?token=${token}`;
  const text = `Dear user,\nTo verify your email, click on this link: ${verificationEmailUrl}\nIf you did not create an account, then ignore this email.`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 32px; background: #fff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
      <h2 style="color: #222;">Verify your email address</h2>
      <p>To continue setting up your account, please verify that this is your email address.</p>
      <a href="${verificationEmailUrl}" style="display: inline-block; padding: 12px 24px; background: #10a37f; color: #fff; text-decoration: none; border-radius: 4px; font-weight: bold; margin: 24px 0;">Verify email address</a>
      <p style="margin-top: 32px; color: #555;">If the button above does not work, copy and paste this link into your browser:</p>
      <p style="word-break: break-all;"><a href="${verificationEmailUrl}" style="color: #10a37f;">${verificationEmailUrl}</a></p>
      <p style="margin-top: 32px; font-size: 13px; color: #888;">If you did not create an account, please ignore this email.</p>
    </div>
  `;
  await sendEmail(to, subject, text, html);
};

// sendEmail("langesh105@gmail.com", "Test Email", "Test Email", "Test Email");

module.exports = {
  sendEmail,
  sendResetPasswordEmail,
  sendResetPasswordOTPEmail,
  sendVerificationEmail,
};
