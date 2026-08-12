const initFirebaseAdmin = require('../config/firebaseAdmin');
const User = require('../models/User');
const { fail } = require('../utils/response');

function readTokenFromHeader(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) {
    return header.slice(7).trim();
  }
  return null;
}

/**
 * Verifies a Firebase ID token and returns the matching Mongo user profile,
 * creating one (as a 'customer') the first time this Firebase account is seen.
 */
async function resolveUserFromToken(token) {
  const admin = initFirebaseAdmin();
  const decoded = await admin.auth().verifyIdToken(token);

  let user = await User.findOne({ firebaseUid: decoded.uid });

  if (!user) {
    user = await User.create({
      firebaseUid: decoded.uid,
      name: decoded.name || (decoded.email ? decoded.email.split('@')[0] : 'Reader'),
      email: decoded.email,
      role: 'customer',
    });
  }

  return user;
}

/**
 * Attaches req.user when a valid Firebase ID token is present, but does not
 * block the request when it is missing or invalid. Use this on routes that
 * must also serve anonymous visitors (e.g. reading books, notifications).
 */
async function identify(req, res, next) {
  const token = readTokenFromHeader(req);

  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const user = await resolveUserFromToken(token);
    req.user = user.isRestricted || user.isResigned ? null : user;
    return next();
  } catch (error) {
    req.user = null;
    return next();
  }
}

/**
 * Requires a valid Firebase ID token. Blocks anonymous requests with 401.
 */
async function protect(req, res, next) {
  const token = readTokenFromHeader(req);

  if (!token) {
    return fail(res, 401, 'You must log in to access this resource.');
  }

  try {
    const user = await resolveUserFromToken(token);

    if (user.isRestricted) {
      return fail(res, 403, 'Your account has been restricted. Please contact support.');
    }

    if (user.isResigned) {
      return fail(res, 403, 'This account no longer has staff access.');
    }

    req.user = user;
    return next();
  } catch (error) {
    return fail(res, 401, 'Your session is invalid or has expired. Please log in again.');
  }
}

/**
 * Restricts a route to a fixed set of roles. Must be used after `protect`.
 */
function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return fail(res, 401, 'You must log in to access this resource.');
    }

    if (!allowedRoles.includes(req.user.role)) {
      return fail(res, 403, 'You do not have permission to perform this action.');
    }

    return next();
  };
}

module.exports = { identify, protect, authorize };
