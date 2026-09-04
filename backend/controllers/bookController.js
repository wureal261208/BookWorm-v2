const Book = require('../models/Book');
const BookMetadata = require('../models/BookMetadata');
const Notification = require('../models/Notification');
const asyncHandler = require('../utils/asyncHandler');
const { success, fail } = require('../utils/response');
const { fetchGutenbergReaderText } = require('../utils/gutenbergReader');

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

  const normalizedChapters = Array.isArray(chapters)
    ? chapters.map((chapter, index) => ({
        order: chapter.order ?? index + 1,
        title: chapter.title,
        content: chapter.content,
      }))
    : [];

  const book = await Book.create({
    title,
    author,
    description,
    category,
    coverUrl,
    readerUrl,
    chapters: normalizedChapters,
    createdBy: req.user._id,
    sourceEtextNumber: Number.isFinite(Number(sourceEtextNumber)) ? Number(sourceEtextNumber) : null,
    status: ['draft', 'published', 'hidden'].includes(status) ? status : 'draft',
    subjects: Array.isArray(subjects) ? subjects : [],
    language: language || 'en',
  });

  if (book.status === 'published') {
    await notifyBookPublished(book, req.user._id);
  }

  return success(res, 201, 'Book pushed successfully.', { book });
});

// @route GET /api/books?limit=&page=
// @desc  Public catalog listing - published books only, paginated. Staff use
//        GET /api/books/mine (below) for the full catalog including
//        drafts/hidden books.
const listBooks = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 32));

  const filter = { status: 'published' };

  const books = await Book.find(filter)
    .select('-chapters')
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit);

  // Defensive: make sure nothing between here and the browser (proxy, CDN,
  // browser disk cache) ever serves a stale book list after a new book gets
  // published - this list needs to reflect Mongo on every request.
  res.setHeader('Cache-Control', 'no-store');

  return success(res, 200, 'Books retrieved successfully.', { books, page, limit });
});

// @route GET /api/books/mine
// @desc  Full book records (including chapters) for the staff admin panel.
//        Not scoped to req.user - admin/manager/employee share one catalog,
//        this isn't just books that specific staffer personally pushed.
const listMyBooks = asyncHandler(async (req, res) => {
  const books = await Book.find().sort({ createdAt: -1 });
  return success(res, 200, 'Managed books retrieved successfully.', { books });
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

  await book.save();

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

module.exports = { createBook, listBooks, listMyBooks, getBook, updateBook, deleteBook, getBookReaderText };
