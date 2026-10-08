const { sendMail } = require('./mailer');

const APP_URL = process.env.APP_URL || process.env.CLIENT_URL || 'http://localhost:5173';

/**
 * Base email layout wrapper with editorial typography and responsive container
 */
function wrapEmailLayout({ title, subtitle, badgeText, contentHtml, footerNote }) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title || 'BookWorm Notification'}</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #f7f6f0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #1e293b;
      line-height: 1.6;
    }
    .email-container {
      max-width: 580px;
      margin: 32px auto;
      background: #ffffff;
      border: 1px solid #e2e0d8;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.04);
    }
    .email-header {
      padding: 28px 32px 20px;
      border-bottom: 1px solid #f1efe8;
      background: #ffffff;
    }
    .brand-title {
      font-family: Georgia, "Playfair Display", serif;
      font-size: 24px;
      font-weight: 700;
      color: #0f172a;
      letter-spacing: -0.5px;
      margin: 0;
    }
    .brand-subtitle {
      font-size: 13px;
      color: #64748b;
      margin: 4px 0 0;
      text-transform: uppercase;
      letter-spacing: 0.8px;
    }
    .badge-pill {
      display: inline-block;
      margin-top: 12px;
      padding: 4px 10px;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      border-radius: 999px;
      background: #f1f5f9;
      color: #475569;
      border: 1px solid #e2e8f0;
    }
    .badge-pill.bot-worm {
      background: #0f172a;
      color: #f8fafc;
      border-color: #0f172a;
    }
    .badge-pill.approved {
      background: #ecfdf5;
      color: #065f46;
      border-color: #a7f3d0;
    }
    .badge-pill.rejected {
      background: #fff1f2;
      color: #9f1239;
      border-color: #fecdd3;
    }
    .email-body {
      padding: 32px;
    }
    .card-box {
      background: #f8f9fa;
      border: 1px solid #e9ecef;
      border-radius: 8px;
      padding: 18px 20px;
      margin: 20px 0;
    }
    .card-row {
      margin-bottom: 8px;
      font-size: 14px;
    }
    .card-row:last-child {
      margin-bottom: 0;
    }
    .card-label {
      font-weight: 600;
      color: #475569;
      margin-right: 8px;
    }
    .card-val {
      color: #0f172a;
    }
    .btn-action {
      display: inline-block;
      background: #111827;
      color: #ffffff !important;
      text-decoration: none;
      padding: 12px 24px;
      font-size: 14px;
      font-weight: 600;
      border-radius: 8px;
      margin-top: 16px;
    }
    .email-footer {
      padding: 20px 32px;
      background: #fafaf9;
      border-top: 1px solid #f1efe8;
      font-size: 12px;
      color: #64748b;
      text-align: center;
    }
    @media (max-width: 600px) {
      .email-container {
        margin: 12px;
        border-radius: 8px;
      }
      .email-header, .email-body, .email-footer {
        padding: 20px;
      }
    }
  </style>
</head>
<body>
  <div class="email-container">
    <div class="email-header">
      <h1 class="brand-title">BookWorm</h1>
      <p class="brand-subtitle">Digital Library &amp; Reader Network</p>
      ${badgeText ? `<div class="badge-pill ${badgeText.toLowerCase().includes('worm') ? 'bot-worm' : badgeText.toLowerCase().includes('approved') ? 'approved' : badgeText.toLowerCase().includes('rejected') || badgeText.toLowerCase().includes('revision') ? 'rejected' : ''}">${badgeText}</div>` : ''}
    </div>
    <div class="email-body">
      ${contentHtml}
    </div>
    <div class="email-footer">
      <p style="margin: 0 0 6px;">${footerNote || 'This is an automated operational notification from BookWorm.'}</p>
      <p style="margin: 0;">BookWorm Platform &copy; 2026. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
  `.trim();
}

/**
 * 1. Book Approval Email
 */
async function sendBookApprovalEmail({ to, authorName, bookTitle, bookId }) {
  if (!to) return false;
  const name = authorName || 'Author';
  const title = bookTitle || 'Your submission';
  const viewUrl = `${APP_URL}/#book-${bookId || ''}`;

  const contentHtml = `
    <h2 style="font-size: 20px; font-weight: 700; color: #0f172a; margin-top: 0;">Submission Approved &amp; Published</h2>
    <p>Dear ${name},</p>
    <p>Congratulations! We are delighted to inform you that your submitted work, <strong>"${title}"</strong>, has passed our editorial review process and is now officially published on BookWorm.</p>
    <div class="card-box">
      <div class="card-row"><span class="card-label">Title:</span> <span class="card-val">${title}</span></div>
      <div class="card-row"><span class="card-label">Status:</span> <span class="card-val" style="color: #059669; font-weight: 600;">Published</span></div>
      <div class="card-row"><span class="card-label">Distribution:</span> <span class="card-val">Public Library Catalog</span></div>
    </div>
    <p>Readers worldwide can now browse, read, and bookmark your book. You can manage your published works anytime in your personal profile dashboard.</p>
    <div style="text-align: center; margin: 24px 0 12px;">
      <a href="${viewUrl}" class="btn-action">View Your Book in Catalog</a>
    </div>
  `;

  const html = wrapEmailLayout({
    title: `Approved: "${title}" is now published on BookWorm`,
    badgeText: 'Submission Approved',
    contentHtml,
    footerNote: 'You received this notification because your book submission was reviewed by the editorial board.',
  });

  return sendMail({
    to,
    from: '"BookWorm Editorial" <editorial@bookworm.app>',
    subject: `Publication Notice: "${title}" is now published on BookWorm`,
    html,
  });
}

/**
 * 2. Book Rejection / Revision Needed Email
 */
async function sendBookRejectionEmail({ to, authorName, bookTitle, reason }) {
  if (!to) return false;
  const name = authorName || 'Author';
  const title = bookTitle || 'Your submission';
  const feedback = reason || 'Content does not meet current platform publishing guidelines or requires editorial revisions.';
  const writeUrl = `${APP_URL}/write`;

  const contentHtml = `
    <h2 style="font-size: 20px; font-weight: 700; color: #0f172a; margin-top: 0;">Submission Status Update</h2>
    <p>Dear ${name},</p>
    <p>Thank you for submitting <strong>"${title}"</strong> to BookWorm. Our editorial and moderation team has evaluated your submission.</p>
    <p>At this time, this work has not been published to the catalog. Please review the feedback details below:</p>
    <div class="card-box" style="border-left: 4px solid #ef4444;">
      <div class="card-row"><span class="card-label">Title:</span> <span class="card-val">${title}</span></div>
      <div class="card-row"><span class="card-label">Current Status:</span> <span class="card-val" style="color: #dc2626; font-weight: 600;">Unpublished / Revision Required</span></div>
      <div class="card-row" style="margin-top: 10px;"><span class="card-label">Editorial Feedback:</span></div>
      <div style="background: #ffffff; border: 1px solid #fee2e2; border-radius: 6px; padding: 10px 14px; margin-top: 6px; color: #7f1d1d; font-size: 14px;">
        ${feedback}
      </div>
    </div>
    <p>You can revisit your draft, update the manuscript chapters, and resubmit it for review directly from your author studio at any time.</p>
    <div style="text-align: center; margin: 24px 0 12px;">
      <a href="${writeUrl}" class="btn-action">Open Author Studio</a>
    </div>
  `;

  const html = wrapEmailLayout({
    title: `Submission Update: "${title}"`,
    badgeText: 'Editorial Feedback',
    contentHtml,
    footerNote: 'You received this notification regarding your book draft submission.',
  });

  return sendMail({
    to,
    from: '"BookWorm Editorial" <editorial@bookworm.app>',
    subject: `Submission Update: Feedback for "${title}"`,
    html,
  });
}

/**
 * 3. Bot "Worm" Moderation Ban Notification Email
 */
async function sendBanNotificationEmail({ to, userName, reason, days, expiresAt }) {
  if (!to) return false;
  const name = userName || 'Reader';
  const banReason = reason || 'Violation of community safety and reading terms.';
  const durationText = days > 0 ? `${days} day(s)` : 'Permanent account restriction';
  const expiryText = expiresAt ? new Date(expiresAt).toUTCString() : 'Indefinite (requires manual administrative review)';

  const contentHtml = `
    <h2 style="font-size: 20px; font-weight: 700; color: #0f172a; margin-top: 0;">Account Restriction Notice</h2>
    <p>Hello ${name},</p>
    <p>I am <strong>Worm</strong>, the automated Security and Policy Guard for BookWorm. This notice is dispatched to inform you that your account has been placed under administrative restriction.</p>
    <div class="card-box" style="border-left: 4px solid #0f172a;">
      <div class="card-row"><span class="card-label">Enforcing Agent:</span> <span class="card-val">Bot "Worm" (Policy &amp; Safety Desk)</span></div>
      <div class="card-row"><span class="card-label">Violation Reason:</span> <span class="card-val">${banReason}</span></div>
      <div class="card-row"><span class="card-label">Duration:</span> <span class="card-val" style="font-weight: 600;">${durationText}</span></div>
      <div class="card-row"><span class="card-label">Restriction Expiry:</span> <span class="card-val">${expiryText}</span></div>
    </div>
    <p><strong>Impact on Account Privileges:</strong></p>
    <ul style="color: #475569; font-size: 14px; padding-left: 20px; margin: 8px 0 16px;">
      <li>Reader catalogue access and bookmarking are temporarily halted.</li>
      <li>Self-publishing manuscript features and comment discussions are disabled.</li>
    </ul>
    <p>If you believe this determination was reached in error, or if you would like to submit an appeal after correcting the violation, you may contact our moderation team at <a href="mailto:support@bookworm.app" style="color: #2563eb;">support@bookworm.app</a>.</p>
    <div class="card-box" style="background: #fafafa; border: 1px dashed #cbd5e1; font-size: 13px; color: #64748b; margin-top: 20px;">
      <strong>Note from Worm:</strong> BookWorm is committed to maintaining a courteous, inspiring, and respectful reading environment for every bibliophile. Thank you for your cooperation.
    </div>
  `;

  const html = wrapEmailLayout({
    title: 'Account Restriction Notice - Bot Worm',
    badgeText: 'Worm | Safety & Policy Bot',
    contentHtml,
    footerNote: 'Dispatched by Bot "Worm" on behalf of BookWorm Moderation & Compliance.',
  });

  return sendMail({
    to,
    from: '"Worm (BookWorm Policy Bot)" <moderation@bookworm.app>',
    subject: `Account Notice from Bot Worm: Account Restriction Applied`,
    html,
  });
}

/**
 * 4. Bot "Worm" Unban / Account Restored Notification Email
 */
async function sendUnbanNotificationEmail({ to, userName }) {
  if (!to) return false;
  const name = userName || 'Reader';
  const loginUrl = `${APP_URL}/login`;

  const contentHtml = `
    <h2 style="font-size: 20px; font-weight: 700; color: #0f172a; margin-top: 0;">Account Privileges Restored</h2>
    <p>Hello ${name},</p>
    <p>I am <strong>Worm</strong>, the BookWorm Policy Bot. Good news: your account restriction has been lifted by the platform administrators.</p>
    <div class="card-box" style="border-left: 4px solid #10b981;">
      <div class="card-row"><span class="card-label">Status:</span> <span class="card-val" style="color: #059669; font-weight: 600;">Active &amp; In Good Standing</span></div>
      <div class="card-row"><span class="card-label">Permissions:</span> <span class="card-val">Catalog Access, Reading Progress, &amp; Publishing Restored</span></div>
    </div>
    <p>You can sign back into your account and continue reading where you left off. Please review our community guidelines to ensure an enjoyable and respectful experience for all members.</p>
    <div style="text-align: center; margin: 24px 0 12px;">
      <a href="${loginUrl}" class="btn-action">Log in to BookWorm</a>
    </div>
  `;

  const html = wrapEmailLayout({
    title: 'Account Restored - Bot Worm',
    badgeText: 'Worm | Account Restored',
    contentHtml,
    footerNote: 'Dispatched by Bot "Worm" on behalf of BookWorm Moderation & Compliance.',
  });

  return sendMail({
    to,
    from: '"Worm (BookWorm Policy Bot)" <moderation@bookworm.app>',
    subject: `Account Restored: Welcome Back to BookWorm`,
    html,
  });
}

/**
 * 5. Password Changed Security Alert Email
 */
async function sendPasswordChangedEmail({ to, userName, when }) {
  if (!to) return false;
  const name = userName || 'there';
  const dateStr = when || new Date().toUTCString();
  const resetUrl = `${APP_URL}/login`;

  const contentHtml = `
    <h2 style="font-size: 20px; font-weight: 700; color: #0f172a; margin-top: 0;">Security Alert: Password Updated</h2>
    <p>Hi ${name},</p>
    <p>This is a formal security confirmation that the password for your BookWorm account (<strong>${to}</strong>) was changed on <strong>${dateStr}</strong>.</p>
    <div class="card-box">
      <div class="card-row"><span class="card-label">Account:</span> <span class="card-val">${to}</span></div>
      <div class="card-row"><span class="card-label">Timestamp:</span> <span class="card-val">${dateStr}</span></div>
      <div class="card-row"><span class="card-label">Status:</span> <span class="card-val" style="color: #059669; font-weight: 600;">Password Change Successful</span></div>
    </div>
    <p>If you made this change, no further action is necessary.</p>
    <p style="color: #b91c1c; font-size: 14px;"><strong>Did not make this change?</strong> Please immediately secure your account by requesting a password reset on our login page, and alert our support desk at <a href="mailto:support@bookworm.app" style="color: #b91c1c;">support@bookworm.app</a>.</p>
    <div style="text-align: center; margin: 24px 0 12px;">
      <a href="${resetUrl}" class="btn-action">Manage Account</a>
    </div>
  `;

  const html = wrapEmailLayout({
    title: 'Security Alert: Password Changed',
    badgeText: 'Security Notice',
    contentHtml,
    footerNote: 'You received this mandatory security alert because your password was modified.',
  });

  return sendMail({
    to,
    from: '"BookWorm Security" <security@bookworm.app>',
    subject: `Security Alert: Your BookWorm password was changed`,
    html,
  });
}

module.exports = {
  wrapEmailLayout,
  sendBookApprovalEmail,
  sendBookRejectionEmail,
  sendBanNotificationEmail,
  sendUnbanNotificationEmail,
  sendPasswordChangedEmail,
};
