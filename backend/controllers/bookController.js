const Book = require('../models/Book');
const BookMetadata = require('../models/BookMetadata');
const Notification = require('../models/Notification');
const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');
const { success, fail } = require('../utils/response');
const { fetchGutenbergReaderText } = require('../utils/gutenbergReader');
const maskEmail = require('../utils/maskEmail');

// Broadcasts a "new book" notification to every customer. Only ever called
// right after a book's status actually becomes 'published' - never for
// drafts/hidden books, and never repeatedly for a book that was already
// published (see the transition checks in createBook/updateBook below).
async function notifyBookPublished(book, staffUserId) {
  await Notification.create({
    title: 'New book published',
    message: `"${book.title}" is now available to read.`,
    createdBy: staffUserId,
    audience: 'all-customers',
    book: book._id,
  });
}

// @route POST /api/books
// @desc  Admin/manager/employee push a new book.
const createBook = asyncHandler(async (req, res) => {
  const {
    title,
    author,
    description,
    category,
    coverUrl,
    readerUrl,
    chapters,
    sourceEtextNumber,
    status,
    subjects,
    language,
  } = req.body;

  if (!title || !author) {
    return fail(res, 400, 'Title and author are required.');
  }

  // Block duplicate pushes - whether that's a genuinely accidental repeat
  // push of the same title, or several near-simultaneous submits (a slow
  // connection, a form double-click) racing past the frontend's own guard.
  // Case/whitespace-insensitive so "The Odyssey " and "the odyssey" collide
  // too. A matching sourceEtextNumber (the same Gutenberg book picked twice)
  // also counts, even if the title was hand-edited afterward.
  const normalizedTitle = title.trim();
  const etextNumber = Number.isFinite(Number(sourceEtextNumber)) ? Number(sourceEtextNumber) : null;
  const duplicate = await Book.findOne({
    $or: [
      { title: { $regex: `^${normalizedTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } },
      ...(etextNumber ? [{ sourceEtextNumber: etextNumber }] : []),
    ],
  });
  if (duplicate) {
    return fail(res, 409, `"${duplicate.title}" is already in the catalog.`);
  }

  const normalizedChapters = Array.isArray(chapters)
    ? chapters.map((chapter, index) => ({
        order: chapter.order ?? index + 1,
        title: chapter.title,
        content: chapter.content,
      }))
    : [];

  // Customers can push books now, but never straight to the public site -
  // their submissions always land as a draft so a staff member reviews and
  // publishes it from User Contributions/Book Management. Staff keep full
  // control over the status they choose.
  const isCustomer = req.user.role === 'customer';
  const resolvedStatus = isCustomer
    ? 'draft'
    : (['draft', 'published', 'hidden'].includes(status) ? status : 'draft');

  let book;
  try {
    book = await Book.create({
      title,
      author,
      description,
      category,
      coverUrl,
      readerUrl,
      chapters: normalizedChapters,
      createdBy: req.user._id,
      createdByRole: req.user.role,
      sourceEtextNumber: etextNumber,
      status: resolvedStatus,
      subjects: Array.isArray(subjects) ? subjects : [],
      language: language || 'en',
    });
  } catch (error) {
    // Belt and suspenders: the findOne check above is a fast, friendly
    // pre-check, but it isn't atomic - two requests within the same few
    // milliseconds of each other (a double-click, a slow connection retried)
    // can both pass it before either has actually saved. The unique index
    // on normalizedTitle is what actually guarantees no duplicate ever gets
    // written, so this catches that case too and gives it the same clear
    // message instead of a raw 500.
    if (error.code === 11000) {
      return fail(res, 409, `"${title.trim()}" is already in the catalog.`);
    }
    throw error;
  }

  if (book.status === 'published') {
    await notifyBookPublished(book, req.user._id);
  }

  return success(res, 201, 'Book pushed successfully.', { book });
});

// @route GET /api/books?limit=&page=&q=&category=&sort=
// @desc  Public catalog listing - published books only, paginated. Staff use
//        GET /api/books/mine (below) for the full catalog including
//        drafts/hidden books. `q` full-text searches title/author/subjects,
//        `category` filters exactly, `sort` is "recent" (default) or
//        "views" (most-read first) - the search/pagination Discover and
//        Home actually need now that the catalog can hold ~75k books, far
//        too many to ever hand the browser in one go.
const listBooks = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 32));

  const filter = { status: 'published' };
  if (req.query.category && req.query.category !== 'all') {
    filter.category = req.query.category;
  }
  if (req.query.q && req.query.q.trim()) {
    filter.$text = { $search: req.query.q.trim() };
  }

  const sort = req.query.sort === 'views'
    ? { views: -1, _id: -1 }
    // Tie-break on _id too - MongoDB's skip/limit pagination is only
    // stable when the sort is fully deterministic. Several books created
    // in the same millisecond (e.g. bulk-imported, or a double-submit
    // before the duplicate-push guard existed) would otherwise sort
    // ambiguously between page requests, so the same book could show up
    // on two pages (visible as duplicate React keys / a book missing from
    // the site while Admin still counts it as published).
    : { createdAt: -1, _id: -1 };

  const [books, total] = await Promise.all([
    Book.find(filter).select('-chapters').sort(sort).skip((page - 1) * limit).limit(limit),
    Book.countDocuments(filter),
  ]);

  // Defensive: make sure nothing between here and the browser (proxy, CDN,
  // browser disk cache) ever serves a stale book list after a new book gets
  // published - this list needs to reflect Mongo on every request.
  res.setHeader('Cache-Control', 'no-store');

  return success(res, 200, 'Books retrieved successfully.', { books, page, limit, total });
});

// @route GET /api/books/mine
// @desc  Full book records (including chapters) for the staff admin panel.
//        Not scoped to req.user - admin/manager/employee share one catalog,
//        this isn't just books that specific staffer personally pushed.
// @route GET /api/books/mine?page=&limit=&contributorRole=
// @desc  Staff (admin/manager/employee) get the full catalog, paginated -
//        this used to return every book in one array, which the 75k-book
//        Gutenberg import makes completely impractical (multi-MB payload,
//        the browser trying to hold and render tens of thousands of rows).
//        Customers get only their own submissions back (see the createdBy
//        filter below), which doubles as the data source for their
//        "My submissions" view.
const listMyBooks = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));

  const filter = {};
  if (req.user.role === 'customer') {
    filter.createdBy = req.user._id;
  } else if (['admin', 'manager', 'employee', 'customer'].includes(req.query.contributorRole)) {
    // Lets the Admin "User Contributions" tab ask for customer-submitted
    // books specifically, without the client having to page through the
    // entire catalog to find them.
    filter.createdByRole = req.query.contributorRole;
  }
  if (['draft', 'published', 'hidden'].includes(req.query.status)) {
    // Book Management's All/Draft/Published filter chips - now a real
    // server-side filter instead of slicing whatever page happened to be
    // loaded, which is the only way that filter can mean anything once the
    // catalog holds ~75k books.
    filter.status = req.query.status;
  }
  if (req.query.q && req.query.q.trim()) {
    filter.$text = { $search: req.query.q.trim() };
  }

  const [books, total] = await Promise.all([
    Book.find(filter)
      .select('-chapters')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('createdBy', 'name email role'),
    Book.countDocuments(filter),
  ]);

  return success(res, 200, 'Managed books retrieved successfully.', { books, page, limit, total });
});

// @route GET /api/books/:id
// @desc  Read a book. Anonymous visitors only get the first 3 chapters.
const getBook = asyncHandler(async (req, res) => {
  const book = await Book.findById(req.params.id);

  if (!book) {
    return fail(res, 404, 'Book not found.');
  }

  const isAnonymous = !req.user;
  const chapterLimit = Book.ANONYMOUS_CHAPTER_LIMIT;

  if (!isAnonymous) {
    return success(res, 200, 'Book retrieved successfully.', { book, isLimited: false });
  }

  const limitedChapters = book.chapters
    .sort((a, b) => a.order - b.order)
    .slice(0, chapterLimit);

  const limitedBook = book.toObject();
  limitedBook.chapters = limitedChapters;

  return success(
    res,
    200,
    `You are reading as a guest. Log in to unlock all chapters beyond the first ${chapterLimit}.`,
    { book: limitedBook, isLimited: book.chapters.length > chapterLimit }
  );
});

// @route PATCH /api/books/:id
// @desc  Admin/manager/employee updates a book.
const updateBook = asyncHandler(async (req, res) => {
  const book = await Book.findById(req.params.id);

  if (!book) {
    return fail(res, 404, 'Book not found.');
  }

  const wasPublished = book.status === 'published';

  const allowedFields = [
    'title',
    'author',
    'description',
    'category',
    'coverUrl',
    'readerUrl',
    'chapters',
    'sourceEtextNumber',
    'status',
    'subjects',
    'language',
  ];

  allowedFields.forEach((field) => {
    if (req.body[field] !== undefined) {
      book[field] = req.body[field];
    }
  });

  try {
    await book.save();
  } catch (error) {
    if (error.code === 11000) {
      return fail(res, 409, `"${book.title}" is already in the catalog.`);
    }
    throw error;
  }

  // Only notify on the Draft/Hidden -> Published transition - not on every
  // edit to a book that was already published, or that isn't published now.
  if (!wasPublished && book.status === 'published') {
    await notifyBookPublished(book, req.user._id);
  }

  return success(res, 200, 'Book updated successfully.', { book });
});

// @route DELETE /api/books/:id
const deleteBook = asyncHandler(async (req, res) => {
  const book = await Book.findByIdAndDelete(req.params.id);

  if (!book) {
    return fail(res, 404, 'Book not found.');
  }

  return success(res, 200, 'Book deleted successfully.', null);
});

// @route GET /api/books/:id/reader-text
// @desc  Real reader text for books that don't have chapters typed into
//        Mongo (see Book.chapters) - fetches the Gutenberg "read online"
//        page server-side (browsers can't hit gutenberg.org directly, no
//        CORS headers there) and returns the cleaned book body only, not
//        the page itself.
const getBookReaderText = asyncHandler(async (req, res) => {
  const book = await Book.findById(req.params.id).select('sourceEtextNumber chapters');

  if (!book) {
    return fail(res, 404, 'Book not found.');
  }

  if (book.chapters.some((chapter) => chapter.content)) {
    return fail(res, 400, 'This book already has chapter content stored directly - reader text is not needed.');
  }

  if (!book.sourceEtextNumber) {
    return fail(res, 404, 'This book is not linked to a Gutenberg catalog entry, so no reader text is available.');
  }

  const metadata = await BookMetadata.findOne({ etextNumber: book.sourceEtextNumber });

  if (!metadata || (!metadata.readOnlineUrl && !metadata.plainTextUtf8Url)) {
    return fail(res, 404, 'No readable source is on file for this book in the Gutenberg catalog.');
  }

  try {
    const text = await fetchGutenbergReaderText({
      readOnlineUrl: metadata.readOnlineUrl,
      plainTextUtf8Url: metadata.plainTextUtf8Url,
    });
    return success(res, 200, 'Reader text retrieved successfully.', { text });
  } catch (error) {
    return fail(res, 502, `Could not fetch reader text from Project Gutenberg: ${error.message}`);
  }
});

// @route POST /api/books/:id/view
// @desc  Records one real read/open of a book - anyone, including
//        anonymous visitors, counts. Fire-and-forget from the frontend the
//        moment a reader opens a book; this is what the Dashboard's "most
//        viewed" stat and each book's on-page view count are based on now,
//        replacing the old browser-only counter that reset on every reload
//        and never counted anyone else's visits.
const incrementBookViews = asyncHandler(async (req, res) => {
  const book = await Book.findByIdAndUpdate(
    req.params.id,
    { $inc: { views: 1 } },
    { new: true, select: 'views' }
  );

  if (!book) {
    return fail(res, 404, 'Book not found.');
  }

  // Only signed-in readers count toward "Top readers" - identify (not
  // protect) is used on this route so anonymous views still bump the
  // book's own count above, they just don't attribute to anyone.
  if (req.user) {
    await User.findByIdAndUpdate(req.user._id, { $inc: { booksReadCount: 1 } });
  }

  return success(res, 200, 'View recorded.', { views: book.views });
});

// @route GET /api/books/stats
// @desc  Admin Dashboard numbers: totals by status/contributor, the most
//        viewed books, and the most commented books. Real aggregates
//        straight from Mongo - nothing here is estimated or client-derived.
const getBookStats = asyncHandler(async (req, res) => {
  const Comment = require('../models/Comment');

  const [totalBooks, statusBreakdown, contributorBreakdown, mostViewed, mostCommentedRaw, mostActiveReadersRaw] = await Promise.all([
    Book.countDocuments({}),
    Book.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    Book.aggregate([{ $group: { _id: '$createdByRole', count: { $sum: 1 } } }]),
    Book.find({}).select('title author views').sort({ views: -1 }).limit(5),
    Comment.aggregate([
      { $group: { _id: '$book', commentCount: { $sum: 1 } } },
      { $sort: { commentCount: -1 } },
      { $limit: 5 },
      { $lookup: { from: 'books', localField: '_id', foreignField: '_id', as: 'book' } },
      { $unwind: '$book' },
      { $project: { _id: 0, bookId: '$book._id', title: '$book.title', author: '$book.author', commentCount: 1 } },
    ]),
    User.find({ booksReadCount: { $gt: 0 } }).select('name email booksReadCount').sort({ booksReadCount: -1 }).limit(5),
  ]);

  const toCountMap = (rows) => rows.reduce((map, row) => ({ ...map, [row._id || 'unknown']: row.count }), {});

  return success(res, 200, 'Stats retrieved successfully.', {
    totalBooks,
    byStatus: toCountMap(statusBreakdown),
    byContributorRole: toCountMap(contributorBreakdown),
    mostViewed: mostViewed.map((book) => ({ id: book._id, title: book.title, author: book.author, views: book.views })),
    mostCommented: mostCommentedRaw,
    mostActiveReaders: mostActiveReadersRaw.map((user) => ({
      id: user._id,
      name: user.name,
      maskedEmail: maskEmail(user.email),
      booksReadCount: user.booksReadCount,
    })),
  });
});

module.exports = {
  createBook,
  listBooks,
  listMyBooks,
  getBook,
  updateBook,
  deleteBook,
  getBookReaderText,
  incrementBookViews,
  getBookStats,
};
