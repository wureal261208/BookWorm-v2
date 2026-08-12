const crypto = require('crypto');
const initFirebaseAdmin = require('../config/firebaseAdmin');
const User = require('../models/User');
const OneTimeCode = require('../models/OneTimeCode');
const maskEmail = require('../utils/maskEmail');
const asyncHandler = require('../utils/asyncHandler');
const { success, fail } = require('../utils/response');

function sanitizeUser(user) {
  return {
    id: user._id,
    name: user.name,
    email: maskEmail(user.email),
    role: user.role,
    isRestricted: user.isRestricted,
    isResigned: user.isResigned,
    createdAt: user.createdAt,
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

// @route PATCH /api/users/:id/restrict
// @desc  Admin/manager restricts a customer account.
const restrictCustomer = asyncHandler(async (req, res) => {
  const target = await User.findById(req.params.id);

  if (!target) {
    return fail(res, 404, 'User not found.');
  }

  if (target.role !== 'customer') {
    return fail(res, 400, 'Only customer accounts can be restricted.');
  }

  target.isRestricted = req.body.isRestricted !== false;
  await target.save();

  try {
    const admin = initFirebaseAdmin();
    await admin.auth().updateUser(target.firebaseUid, { disabled: target.isRestricted });
  } catch (error) {
    console.warn('Could not sync restriction to Firebase Auth:', error.message);
  }

  const action = target.isRestricted ? 'restricted' : 'unrestricted';
  return success(res, 200, `Customer account ${action} successfully.`, {
    user: sanitizeUser(target),
  });
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

module.exports = { createStaffWithCode, generateOneTimeCode, listUsers, restrictCustomer, resignStaff };
