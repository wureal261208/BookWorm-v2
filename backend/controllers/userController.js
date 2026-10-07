const initFirebaseAdmin = require('../config/firebaseAdmin');
const User = require('../models/User');
const Book = require('../models/Book');
const maskEmail = require('../utils/maskEmail');
const escapeRegExp = require('../utils/escapeRegExp');
const { sendMail } = require('../utils/mailer');
const asyncHandler = require('../utils/asyncHandler');
const { success, fail } = require('../utils/response');

function sanitizeUser(user, bookCount) {
  const base = {
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
  // Only meaningful for customers (see the role === 'customer' branch
  // below) - leave it off entirely rather than send a misleading 0 for
  // admin accounts.
  if (typeof bookCount === 'number') {
    base.bookCount = bookCount;
  }
  return base;
}

// @route GET /api/users?page=&limit=&role=&q=
// @desc  Admin-only account directory (customers, since manager/employee
//        accounts were retired) - paginated for the User Contributions >
//        Users panel. Display name + masked email only; real emails never
//        leave this endpoint's sanitizeUser call.
//        role=customer specifically ranks contributors by how many books
//        they've pushed: pull every customer once, join in a per-user push
//        count from the Book collection, sort by that count, then page in
//        memory. The customer directory is real accounts (not the 72k-book
//        catalog) so this stays cheap; every other role keeps the original
//        DB-level pagination.
const listUsers = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));

  const filter = {};
  if (req.query.role) {
    filter.role = req.query.role;
  }
  // Search the customer nickname/display name only - the real email never
  // leaves this endpoint. Escape input so it is always a literal substring.
  const query = String(req.query.q || '').trim().slice(0, 80);
  if (query) {
    filter.name = { $regex: escapeRegExp(query), $options: 'i' };
  }

  if (filter.role === 'customer') {
    const [users, counts] = await Promise.all([
      User.find(filter).sort({ createdAt: -1 }),
      Book.aggregate([
        { $match: { createdByRole: 'customer' } },
        { $group: { _id: '$createdBy', count: { $sum: 1 } } },
      ]),
    ]);

    const countByUser = new Map(counts.map((entry) => [String(entry._id), entry.count]));
    const ranked = users
      .map((user) => ({ user, bookCount: countByUser.get(String(user._id)) || 0 }))
      .sort((a, b) => b.bookCount - a.bookCount || new Date(b.user.createdAt) - new Date(a.user.createdAt));

    const total = ranked.length;
    const start = (page - 1) * limit;
    const pageItems = ranked.slice(start, start + limit);

    return success(res, 200, 'Users retrieved successfully.', {
      users: pageItems.map(({ user, bookCount }) => sanitizeUser(user, bookCount)),
      page,
      limit,
      total,
    });
  }

  const [users, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    User.countDocuments(filter),
  ]);

  return success(res, 200, 'Users retrieved successfully.', {
    users: users.map((user) => sanitizeUser(user)),
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

  // Keep the Firebase identity enabled. Otherwise Firebase rejects login
  // before this app can show the reader the restriction reason and expiry.
  // The protect middleware blocks every authenticated app request instead.

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

// @route GET /api/users/me/progress
// @desc  Returns reading/audio progress for the authenticated user from MongoDB
const getMyProgress = asyncHandler(async (req, res) => {
  const ReadingProgress = require('../models/ReadingProgress');
  const items = await ReadingProgress.find({ user: req.user._id })
    .sort({ updatedAt: -1 })
    .limit(30);
  return success(res, 200, 'Reading progress retrieved.', { progress: items });
});

// @route POST /api/users/me/progress
// @desc  Creates or updates reading/audio progress for the authenticated user
const updateMyProgress = asyncHandler(async (req, res) => {
  const ReadingProgress = require('../models/ReadingProgress');
  const { contentId, title, author, cover, type, chapterIndex, chapterOrder, chapterTitle, percent, currentTime, duration } = req.body;
  if (!contentId || !title) {
    return fail(res, 400, 'contentId and title are required.');
  }

  const update = {
    title,
    author: author || 'Unknown author',
    cover: cover || '',
    type: type || 'ebook',
    chapterIndex: Number(chapterIndex) || 0,
    chapterOrder: Number(chapterOrder) || 0,
    chapterTitle: chapterTitle || '',
    percent: Math.min(100, Math.max(0, Number(percent) || 0)),
    currentTime: Number(currentTime) || 0,
    duration: Number(duration) || 0,
    updatedAt: new Date(),
  };

  const item = await ReadingProgress.findOneAndUpdate(
    { user: req.user._id, contentId: String(contentId) },
    { $set: update },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return success(res, 200, 'Progress updated.', { progress: item });
});

// @route GET /api/users/me/favorites
// @desc  Returns saved books list for the authenticated user from MongoDB
const getMyFavorites = asyncHandler(async (req, res) => {
  return success(res, 200, 'Favorites retrieved.', { favorites: req.user.savedBooks || [] });
});

// @route POST /api/users/me/favorites/:bookId
// @desc  Toggles saved book status for the authenticated user in MongoDB
const toggleFavorite = asyncHandler(async (req, res) => {
  const bookId = String(req.params.bookId || '').trim();
  if (!bookId) {
    return fail(res, 400, 'Book ID is required.');
  }

  const isSaved = (req.user.savedBooks || []).includes(bookId);
  if (isSaved) {
    await User.findByIdAndUpdate(req.user._id, {
      $pull: { savedBooks: bookId, shelvedBooks: { bookId } },
    });
    req.user.savedBooks = (req.user.savedBooks || []).filter((id) => id !== bookId);
    req.user.shelvedBooks = (req.user.shelvedBooks || []).filter((item) => String(item.bookId) !== bookId);
  } else {
    const newShelfItem = { bookId, status: 'want_to_read', updatedAt: new Date() };
    await User.findByIdAndUpdate(req.user._id, {
      $addToSet: { savedBooks: bookId },
      $push: { shelvedBooks: newShelfItem },
    });
    req.user.savedBooks = [...(req.user.savedBooks || []), bookId];
    req.user.shelvedBooks = [...(req.user.shelvedBooks || []), newShelfItem];
  }

  return success(res, 200, isSaved ? 'Removed from saved books.' : 'Saved to your shelf.', {
    saved: !isSaved,
    favorites: req.user.savedBooks,
    shelf: req.user.shelvedBooks,
  });
});

// @route GET /api/users/me/shelf
// @desc  Returns categorized shelf items ('reading', 'want_to_read', 'finished')
const getMyShelf = asyncHandler(async (req, res) => {
  return success(res, 200, 'Shelf retrieved.', {
    shelf: req.user.shelvedBooks || [],
    favorites: req.user.savedBooks || [],
  });
});

// @route POST /api/users/me/shelf/:bookId
// @desc  Adds or updates book in shelf category ('reading', 'want_to_read', 'finished')
const updateShelfStatus = asyncHandler(async (req, res) => {
  const bookId = String(req.params.bookId || '').trim();
  const status = String(req.body.status || 'want_to_read').trim();
  if (!bookId) {
    return fail(res, 400, 'Book ID is required.');
  }
  if (!['reading', 'want_to_read', 'finished'].includes(status)) {
    return fail(res, 400, 'Status must be one of: reading, want_to_read, finished');
  }

  let shelf = Array.isArray(req.user.shelvedBooks) ? [...req.user.shelvedBooks] : [];
  const existingIdx = shelf.findIndex((item) => String(item.bookId) === bookId);
  if (existingIdx >= 0) {
    shelf[existingIdx] = { ...shelf[existingIdx], status, updatedAt: new Date() };
  } else {
    shelf.push({ bookId, status, updatedAt: new Date() });
  }

  await User.findByIdAndUpdate(req.user._id, {
    $set: { shelvedBooks: shelf },
    $addToSet: { savedBooks: bookId },
  });
  req.user.shelvedBooks = shelf;
  if (!req.user.savedBooks.includes(bookId)) {
    req.user.savedBooks = [...req.user.savedBooks, bookId];
  }

  return success(res, 200, 'Book shelf status updated.', {
    shelf: req.user.shelvedBooks,
    favorites: req.user.savedBooks,
  });
});

// @route DELETE /api/users/me/shelf/:bookId
// @desc  Removes book from shelf and saved books
const removeShelfBook = asyncHandler(async (req, res) => {
  const bookId = String(req.params.bookId || '').trim();
  if (!bookId) {
    return fail(res, 400, 'Book ID is required.');
  }

  await User.findByIdAndUpdate(req.user._id, {
    $pull: {
      shelvedBooks: { bookId: bookId },
      savedBooks: bookId,
    },
  });

  req.user.shelvedBooks = (req.user.shelvedBooks || []).filter((s) => String(s.bookId) !== bookId);
  req.user.savedBooks = (req.user.savedBooks || []).filter((id) => String(id) !== bookId);

  return success(res, 200, 'Book removed from shelf.', {
    shelf: req.user.shelvedBooks,
    favorites: req.user.savedBooks,
  });
});

module.exports = {
  listUsers,
  banCustomer,
  unbanCustomer,
  notifyPasswordChanged,
  getMyProgress,
  updateMyProgress,
  getMyFavorites,
  toggleFavorite,
  getMyShelf,
  updateShelfStatus,
  removeShelfBook,
};
