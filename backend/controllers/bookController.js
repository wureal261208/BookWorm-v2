const Book = require('../models/Book');
const asyncHandler = require('../utils/asyncHandler');
const { success, fail } = require('../utils/response');

// @route POST /api/books
// @desc  Admin/manager/employee push a new book.
const createBook = asyncHandler(async (req, res) => {
  const { title, author, description, category, coverUrl, chapters, totalCopies, isAvailableToRent, sourceEtextNumber } = req.body;

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

  const copies = Number.isFinite(totalCopies) ? totalCopies : 1;

  const book = await Book.create({
    title,
    author,
    description,
    category,
    coverUrl,
    chapters: normalizedChapters,
    isAvailableToRent: isAvailableToRent !== false,
    totalCopies: copies,
    availableCopies: copies,
    createdBy: req.user._id,
    sourceEtextNumber: Number.isFinite(Number(sourceEtextNumber)) ? Number(sourceEtextNumber) : null,
  });

  return success(res, 201, 'Book pushed successfully.', { book });
});

// @route GET /api/books
// @desc  Everyone can browse the catalog (title/author/description only).
const listBooks = asyncHandler(async (req, res) => {
  const books = await Book.find().select('-chapters').sort({ createdAt: -1 });
  return success(res, 200, 'Books retrieved successfully.', { books });
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

  const allowedFields = [
    'title',
    'author',
    'description',
    'category',
    'coverUrl',
    'chapters',
    'isAvailableToRent',
    'totalCopies',
    'availableCopies',
    'sourceEtextNumber',
  ];

  allowedFields.forEach((field) => {
    if (req.body[field] !== undefined) {
      book[field] = req.body[field];
    }
  });

  await book.save();
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

module.exports = { createBook, listBooks, getBook, updateBook, deleteBook };
