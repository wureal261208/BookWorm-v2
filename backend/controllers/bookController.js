const Book = require('../models/Book');
const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');
const { success, fail } = require('../utils/response');
const escapeRegExp = require('../utils/escapeRegExp');

const STAFF_ROLES = ['admin', 'manager', 'employee'];
const isStaff = (user) => user && STAFF_ROLES.includes(user.role);

function cleanFiles(files) {
  if (!Array.isArray(files)) return [];
  return files
    .filter((file) => file && typeof file.format === 'string' && typeof file.url === 'string')
    .map((file) => ({ format: file.format.trim().toLowerCase(), url: file.url.trim() }))
    .filter((file) => file.format && /^https?:\/\//i.test(file.url));
}

function cleanBookInput(body) {
  const categories = Array.isArray(body.categories)
    ? body.categories
    : String(body.categories || '').split(',');
  return {
    type: body.type,
    title: String(body.title || '').trim(),
    author: String(body.author || '').trim(),
    description: String(body.description || '').trim(),
    categories: [...new Set(categories.map((item) => String(item).trim()).filter(Boolean))],
    language: String(body.language || 'en').trim().toLowerCase(),
    release_date: body.release_date || null,
    cover_image: String(body.cover_image || '').trim(),
    files: cleanFiles(body.files),
  };
}

function buildCatalogFilter(query, includePending = false) {
  const filter = includePending ? {} : { moderationStatus: 'approved' };
  const terms = String(query.q || '').trim();
  if (terms) filter.$text = { $search: terms };
  if (query.type && ['ebook', 'audiobook'].includes(query.type)) filter.type = query.type;
  if (query.language) filter.language = String(query.language).toLowerCase();
  if (query.source && ['Gutenberg', 'LibriVox', 'User'].includes(query.source)) filter.source = query.source;
  // `category` is retained as a query-string alias for older frontend
  // links. Data is always read from the new `categories` array.
  const categoryQuery = query.categories || query.category;
  if (categoryQuery && categoryQuery !== 'all') {
    const values = String(categoryQuery).split(',').map((item) => item.trim()).filter(Boolean).slice(0, 5);
    if (values.length) filter.categories = { $in: values.map((item) => new RegExp(escapeRegExp(item), 'i')) };
  }
  return filter;
}

const listBooks = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
  const filter = buildCatalogFilter(req.query, isStaff(req.user) && req.query.includePending === 'true');
  if (req.query.sort === 'random') {
    const [books, total] = await Promise.all([
      Book.aggregate([{ $match: filter }, { $sample: { size: limit } }]),
      Book.countDocuments(filter),
    ]);
    return success(res, 200, 'Books retrieved.', { books, page: 1, limit, total });
  }
  const [books, total] = await Promise.all([
    Book.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit),
    Book.countDocuments(filter),
  ]);
  return success(res, 200, 'Books retrieved.', { books, page, limit, total });
});

const getBook = asyncHandler(async (req, res) => {
  const book = await Book.findById(req.params.id);
  if (!book || (book.moderationStatus !== 'approved' && !isStaff(req.user) && String(book.uploadedBy) !== String(req.user?._id))) {
    return fail(res, 404, 'Book not found.');
  }
  return success(res, 200, 'Book retrieved.', { book });
});

const createBook = asyncHandler(async (req, res) => {
  const input = cleanBookInput(req.body);
  if (!['ebook', 'audiobook'].includes(input.type) || !input.title || !input.author || !input.files.length) {
    return fail(res, 400, 'type, title, author and at least one valid file URL are required.');
  }
  const userBook = !isStaff(req.user) || req.body.source === 'User';
  const book = await Book.create({
    ...input,
    source: userBook ? 'User' : (['Gutenberg', 'LibriVox'].includes(req.body.source) ? req.body.source : 'User'),
    moderationStatus: userBook ? 'pending' : 'approved',
    uploadedBy: req.user._id,
    externalId: String(req.body.externalId || '').trim(),
  });
  return success(res, 201, userBook ? 'Book submitted for admin review.' : 'Book created.', { book });
});

const updateBook = asyncHandler(async (req, res) => {
  const book = await Book.findById(req.params.id);
  if (!book) return fail(res, 404, 'Book not found.');
  const input = cleanBookInput({ ...book.toObject(), ...req.body });
  if (!['ebook', 'audiobook'].includes(input.type) || !input.title || !input.author || !input.files.length) {
    return fail(res, 400, 'type, title, author and at least one valid file URL are required.');
  }
  Object.assign(book, input);
  await book.save();
  return success(res, 200, 'Book updated.', { book });
});

const deleteBook = asyncHandler(async (req, res) => {
  const book = await Book.findByIdAndDelete(req.params.id);
  if (!book) return fail(res, 404, 'Book not found.');
  return success(res, 200, 'Book deleted.', null);
});

const listMyBooks = asyncHandler(async (req, res) => {
  const filter = isStaff(req.user) ? buildCatalogFilter(req.query, true) : { uploadedBy: req.user._id };
  if (isStaff(req.user) && req.query.status) filter.moderationStatus = req.query.status;
  const books = await Book.find(filter).sort({ createdAt: -1 }).populate('uploadedBy', 'name email');
  return success(res, 200, 'Submissions retrieved.', { books, total: books.length });
});

const reviewBook = asyncHandler(async (req, res) => {
  const status = req.body.status;
  if (!['approved', 'rejected'].includes(status)) return fail(res, 400, 'status must be approved or rejected.');
  const book = await Book.findById(req.params.id);
  if (!book) return fail(res, 404, 'Book not found.');
  book.moderationStatus = status;
  book.reviewedBy = req.user._id;
  book.reviewedAt = new Date();
  book.rejectionReason = status === 'rejected' ? String(req.body.reason || '').trim() : '';
  await book.save();
  return success(res, 200, `Book ${status}.`, { book });
});

const listCategories = asyncHandler(async (req, res) => {
  const categories = await Book.aggregate([
    { $match: { moderationStatus: 'approved' } }, { $unwind: '$categories' },
    { $group: { _id: '$categories', count: { $sum: 1 } } }, { $sort: { count: -1, _id: 1 } }, { $limit: 30 },
  ]);
  return success(res, 200, 'Categories retrieved.', { categories: categories.map(({ _id, count }) => ({ name: _id, count })) });
});

const getBookStats = asyncHandler(async (req, res) => {
  const [totalBooks, ebooks, audiobooks, pending, users] = await Promise.all([
    Book.countDocuments({ moderationStatus: 'approved' }), Book.countDocuments({ type: 'ebook', moderationStatus: 'approved' }),
    Book.countDocuments({ type: 'audiobook', moderationStatus: 'approved' }), Book.countDocuments({ moderationStatus: 'pending' }), User.countDocuments({}),
  ]);
  return success(res, 200, 'Dashboard statistics retrieved.', { totalBooks, ebooks, audiobooks, pending, users });
});

module.exports = { listBooks, getBook, createBook, updateBook, deleteBook, listMyBooks, reviewBook, listCategories, getBookStats };
