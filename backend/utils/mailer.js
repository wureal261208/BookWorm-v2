const nodemailer = require('nodemailer');

let transporter = null;
let warnedMissingConfig = false;

// Lazily builds the SMTP transporter from env vars. Returns null (instead of
// throwing) when SMTP isn't configured yet, so any feature that sends email
// degrades to "logged a warning" rather than crashing the request that
// triggered it - e.g. a password change must succeed even if the
// confirmation email can't be sent.
function getTransporter() {
  if (transporter) return transporter;

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;

  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
    if (!warnedMissingConfig) {
      warnedMissingConfig = true;
      console.warn(
        'Email sending is not configured (missing SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS in backend/.env) - emails will be skipped, not sent.'
      );
    }
    return null;
  }

  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: process.env.SMTP_SECURE === 'true' || Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

  return transporter;
}

// @param {string} to
// @param {string} subject
// @param {string} html
// @returns {Promise<boolean>} true if the email was actually sent.
async function sendMail({ to, subject, html }) {
  const activeTransporter = getTransporter();
  if (!activeTransporter || !to) return false;

  try {
    await activeTransporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject,
      html,
    });
    return true;
  } catch (error) {
    console.warn('Failed to send email:', error.message);
    return false;
  }
}

module.exports = { sendMail };
