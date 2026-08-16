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

// @route GET /api/book-metadata/batch?ids=84,1342,11
// @desc  Look up many entries at once by Etext Number, e.g. to enrich the
//        app's hardcoded static book list (frontend/src/data/bookData.js),
//        whose ids already are Gutenberg etext numbers.
const getBookMetadataBatch = asyncHandler(async (req, res) => {
  const ids = String(req.query.ids || '')
    .split(',')
    .map((id) => Number(id.trim()))
    .filter((id) => Number.isFinite(id));

  if (!ids.length) {
    return success(res, 200, 'No ids provided.', { results: [] });
  }

  const results = await BookMetadata.find({ etextNumber: { $in: ids } });
  return success(res, 200, 'Book metadata batch retrieved successfully.', { results });
});

// @route GET /api/book-metadata/:etextNumber
const getBookMetadata = asyncHandler(async (req, res) => {
  const entry = await BookMetadata.findOne({ etextNumber: Number(req.params.etextNumber) });

  if (!entry) {
    return fail(res, 404, 'No metadata found for this Etext Number.');
  }

  return success(res, 200, 'Book metadata retrieved successfully.', { entry });
});

module.exports = { searchBookMetadata, getBookMetadata, getBookMetadataBatch };
