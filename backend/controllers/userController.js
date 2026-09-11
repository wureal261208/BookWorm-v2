const initFirebaseAdmin = require('../config/firebaseAdmin');
const User = require('../models/User');
const maskEmail = require('../utils/maskEmail');
const { sendMail } = require('../utils/mailer');
const asyncHandler = require('../utils/asyncHandler');
const { success, fail } = require('../utils/response');

function sanitizeUser(user) {
  return {
    id: user._id,
    displayId: user.displayId || '',
    name: user.name,
    email: maskEmail(user.email),
    role: user.role,
    isRestricted: user.isRestricted,
    banReason: user.banReason || '',
    banExpiresAt: user.banExpiresAt,
    isResigned: user.isResigned,
    createdAt: user.createdAt,
  };
}

// @route GET /api/users?page=&limit=
// @desc  Admin-only account directory (customers, since manager/employee
//        accounts were retired) - paginated for the User Contributions >
//        Users panel. Display name + masked email only; real emails never
//        leave this endpoint's sanitizeUser call.
const listUsers = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));

  const filter = {};
  if (req.query.role) {
    filter.role = req.query.role;
  }

  const [users, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    User.countDocuments(filter),
  ]);

  return success(res, 200, 'Users retrieved successfully.', {
    users: users.map(sanitizeUser),
    page,
    limit,
    total,
  });
});

// @route PATCH /api/users/:id/ban
// @desc  Admin bans a customer for N days with a required reason.
//        days = 0 means a permanent ban (lifted only by an explicit unban).
const banCustomer = asyncHandler(async (req, res) => {
  const target = await User.findById(req.params.id);

  if (!target) {
    return fail(res, 404, 'User not found.');
  }

  if (target.role !== 'customer') {
    return fail(res, 400, 'Only customer accounts can be banned.');
  }

  const reason = (req.body.reason || '').trim();
  const days = Number(req.body.days);

  if (!reason) {
    return fail(res, 400, 'A ban reason is required.');
  }

  if (!Number.isFinite(days) || days < 0) {
    return fail(res, 400, 'Ban length must be 0 (permanent) or a positive number of days.');
  }

  target.isRestricted = true;
  target.banReason = reason;
  target.banExpiresAt = days > 0 ? new Date(Date.now() + days * 24 * 60 * 60 * 1000) : null;
  target.bannedBy = req.user._id;
  target.bannedAt = new Date();
  await target.save();

  try {
    const admin = initFirebaseAdmin();
    await admin.auth().updateUser(target.firebaseUid, { disabled: true });
  } catch (error) {
    console.warn('Could not sync ban to Firebase Auth:', error.message);
  }

  return success(res, 200, 'Customer account banned successfully.', { user: sanitizeUser(target) });
});

// @route PATCH /api/users/:id/unban
// @desc  Admin manually lifts a customer ban early.
const unbanCustomer = asyncHandler(async (req, res) => {
  const target = await User.findById(req.params.id);

  if (!target) {
    return fail(res, 404, 'User not found.');
  }

  if (target.role !== 'customer') {
    return fail(res, 400, 'Only customer accounts can be unbanned.');
  }

  target.isRestricted = false;
  target.banReason = '';
  target.banExpiresAt = null;
  target.bannedBy = null;
  target.bannedAt = null;
  await target.save();

  try {
    const admin = initFirebaseAdmin();
    await admin.auth().updateUser(target.firebaseUid, { disabled: false });
  } catch (error) {
    console.warn('Could not sync unban to Firebase Auth:', error.message);
  }

  return success(res, 200, 'Customer account unbanned successfully.', { user: sanitizeUser(target) });
});

// @route POST /api/users/me/password-changed
// @desc  Called by the frontend right after Firebase reauth + updatePassword
//        succeeds (Profile > Change password). Does NOT change the password
//        itself - Firebase already did that client-side; this just records
//        it and emails a "was this you?" notice. Never blocks/fails the
//        password change itself if the email can't be sent.
const notifyPasswordChanged = asyncHandler(async (req, res) => {
  req.user.passwordChangedAt = new Date();
  await req.user.save();

  const when = req.user.passwordChangedAt.toUTCString();
  await sendMail({
    to: req.user.email,
    subject: 'Your BookWorm password was changed',
    html: `
      <p>Hi ${req.user.name || 'there'},</p>
      <p>This is a confirmation that the password for your BookWorm account (${req.user.email}) was changed on ${when}.</p>
      <p>If you made this change, no action is needed.</p>
      <p>If you did <strong>not</strong> make this change, please contact an admin right away and reset your password from the Login page.</p>
    `,
  });

  return success(res, 200, 'Password change recorded.', { passwordChangedAt: req.user.passwordChangedAt });
});

module.exports = {
  listUsers,
  banCustomer,
  unbanCustomer,
  notifyPasswordChanged,
};
