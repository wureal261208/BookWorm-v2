const BookMetadata = require('../models/BookMetadata');
const asyncHandler = require('../utils/asyncHandler');
const { success, fail } = require('../utils/response');

// @route GET /api/book-metadata?q=&page=&limit=
// @desc  Search the imported Gutenberg catalog by title/author/subject.
const searchBookMetadata = asyncHandler(async (req, res) => {
  const { q } = req.query;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Number(req.query.limit) || 20);

  const filter = q ? { $text: { $search: q } } : {};

  const [results, total] = await Promise.all([
    BookMetadata.find(filter)
      .skip((page - 1) * limit)
      .limit(limit)
      .sort(q ? { score: { $meta: 'textScore' } } : { etextNumber: 1 }),
    BookMetadata.countDocuments(filter),
  ]);

  return success(res, 200, 'Book metadata retrieved successfully.', {
    results,
    page,
    limit,
    total,
  });
});

// @route GET /api/book-metadata/:etextNumber
const getBookMetadata = asyncHandler(async (req, res) => {
  const entry = await BookMetadata.findOne({ etextNumber: Number(req.params.etextNumber) });

  if (!entry) {
    return fail(res, 404, 'No metadata found for this Etext Number.');
  }

  return success(res, 200, 'Book metadata retrieved successfully.', { entry });
});

module.exports = { searchBookMetadata, getBookMetadata };
