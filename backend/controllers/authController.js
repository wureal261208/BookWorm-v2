const maskEmail = require('../utils/maskEmail');
const asyncHandler = require('../utils/asyncHandler');
const { success } = require('../utils/response');

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
    createdAt: user.createdAt,
  };
}

// @route GET /api/auth/me  (alias: GET /api/users/me)
// @desc  Returns the profile for the verified Firebase account. `protect`
//        middleware has already created this profile as 'customer' if this
//        is the first time this Firebase account has been seen.
const getMe = asyncHandler(async (req, res) => {
  return success(res, 200, 'Current user retrieved.', { user: sanitizeUser(req.user) });
});

module.exports = { getMe, sanitizeUser };
