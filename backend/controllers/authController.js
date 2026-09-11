const maskEmail = require('../utils/maskEmail');
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
    createdAt: user.createdAt,
    themePreference: user.themePreference || null,
  };
}

// @route GET /api/auth/me  (alias: GET /api/users/me)
// @desc  Returns the profile for the verified Firebase account. `protect`
//        middleware has already created this profile as 'customer' if this
//        is the first time this Firebase account has been seen.
const getMe = asyncHandler(async (req, res) => {
  return success(res, 200, 'Current user retrieved.', { user: sanitizeUser(req.user) });
});

// @route PATCH /api/users/me/theme
// @desc  Saves the caller's light/dark preference so it follows their
//        account across devices instead of resetting every time they log
//        in somewhere new. Purely a preference - never forced.
const updateMyTheme = asyncHandler(async (req, res) => {
  const { theme } = req.body;
  if (!['light', 'dark'].includes(theme)) {
    return fail(res, 400, 'Theme must be "light" or "dark".');
  }

  req.user.themePreference = theme;
  await req.user.save();

  return success(res, 200, 'Theme preference saved.', { themePreference: theme });
});

module.exports = { getMe, sanitizeUser, updateMyTheme };
