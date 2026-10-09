const {
  wrapEmailLayout,
  sendBookApprovalEmail,
  sendBookRejectionEmail,
  sendBanNotificationEmail,
  sendUnbanNotificationEmail,
  sendPasswordChangedEmail,
  sendPasswordResetEmail,
  sendWelcomeEmail,
  sendBookSubmissionEmail,
} = require('../utils/emailTemplates');
const mailer = require('../utils/mailer');

jest.mock('../utils/mailer', () => ({
  sendMail: jest.fn().mockResolvedValue(true),
}));

describe('Email Notification Engine & Bot Worm Templates', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('wrapEmailLayout creates responsive container with BookWorm header and footer', () => {
    const html = wrapEmailLayout({
      title: 'Test Notification',
      badgeText: 'Worm | Safety & Policy Bot',
      contentHtml: '<p>Test content message</p>',
    });

    expect(html).toContain('BookWorm');
    expect(html).toContain('Digital Library &amp; Reader Network');
    expect(html).toContain('Worm | Safety & Policy Bot');
    expect(html).toContain('Test content message');
    expect(html).toContain('All rights reserved');
    // Ensure no emojis are included
    expect(html).not.toMatch(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u);
  });

  test('sendBookApprovalEmail dispatches email with publication details and link', async () => {
    await sendBookApprovalEmail({
      to: 'author@example.com',
      authorName: 'Arthur Conan Doyle',
      bookTitle: 'The Sign of Four',
      bookId: 'book-12345',
    });

    expect(mailer.sendMail).toHaveBeenCalledTimes(1);
    const callArgs = mailer.sendMail.mock.calls[0][0];
    expect(callArgs.to).toBe('author@example.com');
    expect(callArgs.subject).toContain('The Sign of Four');
    expect(callArgs.from).toContain('BookWorm Editorial');
    expect(callArgs.html).toContain('Arthur Conan Doyle');
    expect(callArgs.html).toContain('Submission Approved &amp; Published');
    expect(callArgs.html).toContain('book-12345');
  });

  test('sendBookRejectionEmail dispatches editorial feedback and revision instructions', async () => {
    await sendBookRejectionEmail({
      to: 'author@example.com',
      authorName: 'Mary Shelley',
      bookTitle: 'The Modern Prometheus',
      reason: 'Chapter 2 requires formatted paragraphs and clean text.',
    });

    expect(mailer.sendMail).toHaveBeenCalledTimes(1);
    const callArgs = mailer.sendMail.mock.calls[0][0];
    expect(callArgs.to).toBe('author@example.com');
    expect(callArgs.subject).toContain('The Modern Prometheus');
    expect(callArgs.html).toContain('Mary Shelley');
    expect(callArgs.html).toContain('Chapter 2 requires formatted paragraphs');
    expect(callArgs.html).toContain('Unpublished / Revision Required');
  });

  test('sendBanNotificationEmail dispatches Bot Worm moderation alert with duration and policy reason', async () => {
    const expiresAt = new Date('2026-11-01T00:00:00Z');
    await sendBanNotificationEmail({
      to: 'violator@example.com',
      userName: 'John Doe',
      reason: 'Repeated offensive spam comments in public discussion',
      days: 7,
      expiresAt,
    });

    expect(mailer.sendMail).toHaveBeenCalledTimes(1);
    const callArgs = mailer.sendMail.mock.calls[0][0];
    expect(callArgs.to).toBe('violator@example.com');
    expect(callArgs.from).toContain('Worm (BookWorm Policy Bot)');
    expect(callArgs.subject).toContain('Bot Worm');
    expect(callArgs.html).toContain('John Doe');
    expect(callArgs.html).toContain('Bot "Worm"');
    expect(callArgs.html).toContain('Repeated offensive spam comments');
    expect(callArgs.html).toContain('7 day(s)');
  });

  test('sendUnbanNotificationEmail dispatches Bot Worm account restored notification', async () => {
    await sendUnbanNotificationEmail({
      to: 'reader@example.com',
      userName: 'Jane Reader',
    });

    expect(mailer.sendMail).toHaveBeenCalledTimes(1);
    const callArgs = mailer.sendMail.mock.calls[0][0];
    expect(callArgs.to).toBe('reader@example.com');
    expect(callArgs.from).toContain('Worm (BookWorm Policy Bot)');
    expect(callArgs.subject).toContain('Account Restored');
    expect(callArgs.html).toContain('Jane Reader');
    expect(callArgs.html).toContain('Account Privileges Restored');
  });

  test('sendPasswordChangedEmail dispatches security alert to account email', async () => {
    await sendPasswordChangedEmail({
      to: 'user@example.com',
      userName: 'Alice',
      when: 'Wed, 08 Oct 2026 12:00:00 GMT',
    });

    expect(mailer.sendMail).toHaveBeenCalledTimes(1);
    const callArgs = mailer.sendMail.mock.calls[0][0];
    expect(callArgs.to).toBe('user@example.com');
    expect(callArgs.subject).toContain('Your BookWorm password was changed');
    expect(callArgs.html).toContain('Security Alert: Password Updated');
    expect(callArgs.html).toContain('Alice');
    expect(callArgs.html).toContain('user@example.com');
  });

  test('sendPasswordResetEmail dispatches password reset link with 60-minute expiry notice', async () => {
    await sendPasswordResetEmail({
      to: 'resetme@example.com',
      userName: 'Bob Reader',
      resetLink: 'https://bookworm.app/__/auth/action?mode=resetPassword&oobCode=XYZ123',
    });

    expect(mailer.sendMail).toHaveBeenCalledTimes(1);
    const callArgs = mailer.sendMail.mock.calls[0][0];
    expect(callArgs.to).toBe('resetme@example.com');
    expect(callArgs.subject).toContain('Reset your BookWorm password');
    expect(callArgs.html).toContain('Password Reset Request');
    expect(callArgs.html).toContain('Bob Reader');
    expect(callArgs.html).toContain('https://bookworm.app/__/auth/action?mode=resetPassword&oobCode=XYZ123');
    expect(callArgs.html).toContain('within the next 60 minutes');
  });

  test('sendWelcomeEmail dispatches member onboarding details with reader ID', async () => {
    await sendWelcomeEmail({
      to: 'newbie@example.com',
      userName: 'Charlie',
      displayId: 'BW-000999',
    });

    expect(mailer.sendMail).toHaveBeenCalledTimes(1);
    const callArgs = mailer.sendMail.mock.calls[0][0];
    expect(callArgs.to).toBe('newbie@example.com');
    expect(callArgs.subject).toContain('Welcome to BookWorm, Charlie!');
    expect(callArgs.html).toContain('Welcome to BookWorm');
    expect(callArgs.html).toContain('Charlie');
    expect(callArgs.html).toContain('BW-000999');
    expect(callArgs.html).toContain('Active Member');
  });

  test('sendBookSubmissionEmail dispatches manuscript submission receipt', async () => {
    await sendBookSubmissionEmail({
      to: 'writer@example.com',
      authorName: 'Dan Brown',
      bookTitle: 'Angels & Demons',
      bookId: 'b-98765',
    });

    expect(mailer.sendMail).toHaveBeenCalledTimes(1);
    const callArgs = mailer.sendMail.mock.calls[0][0];
    expect(callArgs.to).toBe('writer@example.com');
    expect(callArgs.subject).toContain('Angels & Demons');
    expect(callArgs.html).toContain('Manuscript Submission Received');
    expect(callArgs.html).toContain('Dan Brown');
    expect(callArgs.html).toContain('Under Editorial Review');
    expect(callArgs.html).toContain('/write');
  });
});
