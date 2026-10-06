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
    preferredCategories: user.preferredCategories || [],
    hasSetPreferences: Boolean(user.hasSetPreferences),
    savedBooks: user.savedBooks || [],
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

// @route PATCH /api/users/me/preferences
// @desc  The signup onboarding step ("what do you like to read?") and
//        Profile's own "update your reading preferences" both call this -
//        same endpoint either way, just a different moment. An empty array
//        is a valid, deliberate choice ("none of these, skip"), which is
//        why hasSetPreferences is its own flag rather than just checking
//        preferredCategories.length.
const updateMyPreferences = asyncHandler(async (req, res) => {
  const categories = Array.isArray(req.body.categories)
    ? req.body.categories.filter((category) => typeof category === 'string' && category.trim()).slice(0, 20)
    : [];

  req.user.preferredCategories = categories;
  req.user.hasSetPreferences = true;
  await req.user.save();

  return success(res, 200, 'Preferences saved.', { preferredCategories: categories });
});

// @route POST /api/users/me/engagement
// @desc  Fired (best-effort, see ContentReaderPage.jsx/ContentPlayerPage.jsx)
//        whenever this reader opens a Content item, with that item's own
//        categories - a lightweight signal of what they actually read/
//        listen to, not just what they said they liked at signup. Feeds
//        GET /api/content/for-you alongside preferredCategories.
const recordCategoryEngagement = asyncHandler(async (req, res) => {
  const categories = Array.isArray(req.body.categories)
    ? req.body.categories.filter((category) => typeof category === 'string' && category.trim())
    : [];

  for (const category of categories) {
    const current = req.user.categoryEngagement.get(category) || 0;
    req.user.categoryEngagement.set(category, current + 1);
  }
  if (categories.length) await req.user.save();

  return success(res, 200, 'Recorded.', null);
});

module.exports = { getMe, sanitizeUser, updateMyTheme, updateMyPreferences, recordCategoryEngagement };
