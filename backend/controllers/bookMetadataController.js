const BookMetadata = require('../models/BookMetadata');
const Book = require('../models/Book');
const asyncHandler = require('../utils/asyncHandler');
const { success, fail } = require('../utils/response');

// @route GET /api/book-metadata?q=&page=&limit=
// @desc  Search the imported Gutenberg catalog by title/author/subject.
//        Each result is tagged `alreadyAdded` (already pushed to the real
//        `books` collection, matched by Etext Number) so the "Add a new
//        book" search can mark it, block re-adding it, and - within the
//        page of results actually shown - list not-yet-added matches
//        first instead of mixing them in relevance order. Only applies
//        this reordering on page 1, where it actually matters (that's the
//        live-suggestions box admins see while typing); deeper pages keep
//        plain relevance order.
const searchBookMetadata = asyncHandler(async (req, res) => {
  const { q } = req.query;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Number(req.query.limit) || 20);

  const filter = q ? { $text: { $search: q } } : {};
  const sort = q ? { score: { $meta: 'textScore' } } : { etextNumber: 1 };

  // On page 1, pull a larger candidate pool so that if the top relevance
  // matches happen to already be pushed, there are still enough
  // not-yet-added matches on hand to fill the requested `limit` after
  // reordering below - otherwise the visible list could end up mostly (or
  // entirely) "already added" entries even when better new options exist
  // just outside the plain top-N cutoff.
  const poolSize = page === 1 ? Math.min(100, limit * 5) : limit;

  const [candidates, total] = await Promise.all([
    BookMetadata.find(filter)
      .skip((page - 1) * limit)
      .limit(poolSize)
      .sort(sort),
    BookMetadata.countDocuments(filter),
  ]);

  const candidateEtextNumbers = candidates.map((entry) => entry.etextNumber);
  const alreadyAddedNumbers = new Set(
    await Book.distinct('sourceEtextNumber', { sourceEtextNumber: { $in: candidateEtextNumbers } })
  );

  const tagged = candidates.map((entry) => ({
    ...entry.toObject(),
    alreadyAdded: alreadyAddedNumbers.has(entry.etextNumber),
  }));

  const results = page === 1
    ? [...tagged.filter((entry) => !entry.alreadyAdded), ...tagged.filter((entry) => entry.alreadyAdded)].slice(0, limit)
    : tagged;

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
