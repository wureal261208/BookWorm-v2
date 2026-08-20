const crypto = require('crypto');
const initFirebaseAdmin = require('../config/firebaseAdmin');
const User = require('../models/User');
const OneTimeCode = require('../models/OneTimeCode');
const maskEmail = require('../utils/maskEmail');
const generateDisplayId = require('../utils/generateDisplayId');
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
    section: user.section || null,
    isRestricted: user.isRestricted,
    banReason: user.banReason || '',
    banExpiresAt: user.banExpiresAt,
    isResigned: user.isResigned,
    createdAt: user.createdAt,
  };
}

// Search results are picked by an admin/manager to then act on that exact
// account (promote to staff, etc.) - the masked email from sanitizeUser
// isn't usable for that, so this variant keeps it in full. Never expose
// this outside the authenticated admin/manager search endpoint below.
function sanitizeUserForStaffSearch(user) {
  return {
    id: user._id,
    displayId: user.displayId || '',
    name: user.name,
    email: user.email,
    role: user.role,
  };
}

// @route POST /api/users/register-with-code
// @desc  Creates a manager or employee account by redeeming a one-time code.
//        Creates the Firebase Auth account server-side (via Admin SDK) so the
//        admin/manager issuing the code stays logged into their own session -
//        the new hire logs in themselves afterwards with the given password.
const createStaffWithCode = asyncHandler(async (req, res) => {
  const { name, email, password, code } = req.body;

  if (!name || !email || !password || !code) {
    return fail(res, 400, 'Name, email, password and one-time code are required.');
  }

  if (password.length < 6) {
    return fail(res, 400, 'Password must be at least 6 characters long.');
  }

  const codeDoc = await OneTimeCode.findOne({ code });

  if (!codeDoc) {
    return fail(res, 400, 'This one-time code is invalid.');
  }

  if (codeDoc.used) {
    return fail(res, 400, 'This one-time code has already been used.');
  }

  if (codeDoc.expiresAt < new Date()) {
    return fail(res, 400, 'This one-time code has expired.');
  }

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    return fail(res, 409, 'An account with this email already exists.');
  }

  const admin = initFirebaseAdmin();
  const firebaseUser = await admin.auth().createUser({
    email: email.toLowerCase(),
    password,
    displayName: name,
  });

  const user = await User.create({
    firebaseUid: firebaseUser.uid,
    name,
    email: email.toLowerCase(),
    role: codeDoc.role,
    createdBy: codeDoc.createdBy,
    displayId: await generateDisplayId(codeDoc.role),
  });

  codeDoc.used = true;
  codeDoc.usedBy = user._id;
  await codeDoc.save();

  return success(res, 201, `Account created successfully with role: ${codeDoc.role}. The new account can now log in.`, {
    user: sanitizeUser(user),
  });
});

// @route POST /api/users/one-time-code
// @desc  Admin can generate codes for 'manager' or 'employee'.
//        Manager can only generate codes for 'employee'.
const generateOneTimeCode = asyncHandler(async (req, res) => {
  const { role } = req.body;

  if (!['manager', 'employee'].includes(role)) {
    return fail(res, 400, "Role must be either 'manager' or 'employee'.");
  }

  if (req.user.role === 'manager' && role !== 'employee') {
    return fail(res, 403, 'Managers can only generate one-time codes for employee accounts.');
  }

  const hours = Number(process.env.ONE_TIME_CODE_EXPIRES_HOURS || 24);
  const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);
  const code = crypto.randomBytes(6).toString('hex').toUpperCase();

  const codeDoc = await OneTimeCode.create({
    code,
    role,
    createdBy: req.user._id,
    expiresAt,
  });

  return success(res, 201, 'One-time code generated successfully.', {
    code: codeDoc.code,
    role: codeDoc.role,
    expiresAt: codeDoc.expiresAt,
  });
});

// @route GET /api/users
// @desc  Admin/manager can list accounts.
const listUsers = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.role) {
    filter.role = req.query.role;
  }

  const users = await User.find(filter).sort({ createdAt: -1 });
  return success(res, 200, 'Users retrieved successfully.', {
    users: users.map(sanitizeUser),
  });
});

// @route PATCH /api/users/:id/ban
// @desc  Admin/manager bans a customer for N days with a required reason.
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
// @desc  Admin/manager manually lifts a customer ban early.
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

// @route PATCH /api/users/:id/resign
// @desc  Admin can resign manager or employee. Manager can only resign employee.
const resignStaff = asyncHandler(async (req, res) => {
  const target = await User.findById(req.params.id);

  if (!target) {
    return fail(res, 404, 'User not found.');
  }

  if (!['manager', 'employee'].includes(target.role)) {
    return fail(res, 400, 'Only manager or employee accounts can be resigned.');
  }

  if (req.user.role === 'manager' && target.role !== 'employee') {
    return fail(res, 403, 'Managers can only resign employee accounts.');
  }

  target.isResigned = true;
  await target.save();

  try {
    const admin = initFirebaseAdmin();
    await admin.auth().updateUser(target.firebaseUid, { disabled: true });
  } catch (error) {
    console.warn('Could not sync resignation to Firebase Auth:', error.message);
  }

  return success(res, 200, 'Staff account resigned successfully.', {
    user: sanitizeUser(target),
  });
});

// @route PATCH /api/users/upsert-by-email
// @desc  Creates a new manager/employee account by email, or promotes/updates
//        an existing account (any role except admin) to manager/employee.
//        New accounts get a Firebase Auth user + a one-time temporary
//        password returned once in the response. Admin can grant either
//        role; manager can only grant 'employee' (enforced below).
const upsertStaffByEmail = asyncHandler(async (req, res) => {
  const { name, role, section, id } = req.body;
  const email = (req.body.email || '').trim().toLowerCase();

  if (!name || (!email && !id)) {
    return fail(res, 400, 'Name and an email (or account id) are required.');
  }

  if (!['manager', 'employee'].includes(role)) {
    return fail(res, 400, "Role must be either 'manager' or 'employee'.");
  }

  if (req.user.role === 'manager' && role !== 'employee') {
    return fail(res, 403, 'Managers can only grant employee access.');
  }

  const normalizedSection = role === 'employee' && section === 'rent' ? 'rent' : role === 'employee' ? 'read' : null;

  // Prefer `id` when the caller already has it (e.g. editing an existing
  // staff row) - the `staff` list's email is masked for display, so it
  // can't reliably be matched back to a real Mongo document by string.
  let target = id ? await User.findById(id) : await User.findOne({ email });

  if (id && !target) {
    return fail(res, 404, 'Account not found.');
  }

  if (target) {
    if (target.role === 'admin') {
      return fail(res, 400, "This account is an admin - it can't be changed here.");
    }

    const roleChanged = target.role !== role;
    target.name = name;
    target.role = role;
    target.section = normalizedSection;
    if (roleChanged) {
      target.displayId = await generateDisplayId(role);
    }
    await target.save();

    return success(res, 200, `${name} now has ${role} access.`, { user: sanitizeUser(target) });
  }

  const admin = initFirebaseAdmin();
  const temporaryPassword = crypto.randomBytes(9).toString('base64').replace(/[/+=]/g, '').slice(0, 12) + '!1';

  let firebaseUser;
  try {
    firebaseUser = await admin.auth().getUserByEmail(email);
  } catch (error) {
    firebaseUser = await admin.auth().createUser({ email, password: temporaryPassword, displayName: name });
  }

  target = await User.create({
    firebaseUid: firebaseUser.uid,
    name,
    email,
    role,
    section: normalizedSection,
    createdBy: req.user._id,
    displayId: await generateDisplayId(role),
  });

  return success(res, 201, `${name} was granted ${role} access. Share the temporary password with them once.`, {
    user: sanitizeUser(target),
    temporaryPassword,
  });
});

// @route GET /api/users/search?q=...
// @desc  Admin/manager searches any existing account by name or email, to
//        pick one and promote it to staff instead of typing a new person.
const searchUsers = asyncHandler(async (req, res) => {
  const query = (req.query.q || '').trim();

  if (query.length < 2) {
    return success(res, 200, 'Search results retrieved.', { users: [] });
  }

  const pattern = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const users = await User.find({
    role: { $ne: 'admin' },
    $or: [{ name: pattern }, { email: pattern }],
  })
    .sort({ createdAt: -1 })
    .limit(10);

  return success(res, 200, 'Search results retrieved.', { users: users.map(sanitizeUserForStaffSearch) });
});

// @route DELETE /api/users/:id
// @desc  Permanently removes a manager/employee account (Mongo + Firebase
//        Auth). Admin can remove manager or employee. Manager can only
//        remove employee. Use /resign instead to revoke without deleting.
const deleteStaffAccount = asyncHandler(async (req, res) => {
  const target = await User.findById(req.params.id);

  if (!target) {
    return fail(res, 404, 'User not found.');
  }

  if (!['manager', 'employee'].includes(target.role)) {
    return fail(res, 400, 'Only manager or employee accounts can be removed here.');
  }

  if (req.user.role === 'manager' && target.role !== 'employee') {
    return fail(res, 403, 'Managers can only remove employee accounts.');
  }

  try {
    const admin = initFirebaseAdmin();
    await admin.auth().deleteUser(target.firebaseUid);
  } catch (error) {
    console.warn('Could not remove Firebase Auth account:', error.message);
  }

  await target.deleteOne();

  return success(res, 200, 'Staff account removed successfully.', { id: req.params.id });
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
      <p>If you did <strong>not</strong> make this change, please contact an admin or manager right away and reset your password from the Login page.</p>
    `,
  });

  return success(res, 200, 'Password change recorded.', { passwordChangedAt: req.user.passwordChangedAt });
});

module.exports = {
  createStaffWithCode,
  generateOneTimeCode,
  listUsers,
  upsertStaffByEmail,
  searchUsers,
  deleteStaffAccount,
  banCustomer,
  unbanCustomer,
  resignStaff,
  notifyPasswordChanged,
};
