const Content = require('../models/Content');
const asyncHandler = require('../utils/asyncHandler');
const { success } = require('../utils/response');
const { ingestAllContent } = require('../utils/contentIngestion');

// Public reads - only ever approved content, straight from Mongo. User
// uploads sit as status:'pending' until an admin approves them (see the
// "not built yet" note in contentRoutes.js) and never show up here until
// then.
const listContent = asyncHandler(async (req, res) => {
  const { type, search, category, language } = req.query;
  const limit = Math.min(Number(req.query.limit) || 24, 100);
  const page = Math.max(Number(req.query.page) || 1, 1);

  const filter = { status: 'published' };
  if (type === 'ebook' || type === 'audiobook') filter.type = type;
  // Case-insensitive contains match, not an exact array-element match -
  // the site's curated genre names (e.g. "Science Fiction" on the promo
  // banner) rarely match Gutendex's raw Library-of-Congress-style subject
  // strings or LibriVox's own genre labels word-for-word, so an exact
  // match would return nothing for most categories.
  if (category) filter.categories = { $regex: category, $options: 'i' };
  if (language) filter.language = language;
  if (search) filter.$text = { $search: search };

  const [items, total] = await Promise.all([
    Content.find(filter)
      .sort(search ? { score: { $meta: 'textScore' } } : { downloadCount: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Content.countDocuments(filter),
  ]);

  return success(res, 200, 'Content fetched.', { items, total, page, limit });
});

// Public, no auth - backs the AI Suggestions page. Honest about what this
// actually is: there's no reading/listening-history model yet (Content has
// no view/play tracking at all, unlike the old Book model's view counts),
// so this is the "top categories phổ biến" half of the spec, not real
// personalization. Once Content gets its own view/play tracking, this is
// the endpoint to extend with a per-user history filter.
const getTopCategories = asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 12, 30);

  const results = await Content.aggregate([
    { $match: { status: 'published' } },
    { $unwind: '$categories' },
    { $group: { _id: '$categories', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: limit },
  ]);

  return success(
    res,
    200,
    'Top categories fetched.',
    results.map((entry) => ({ category: entry._id, count: entry.count })),
  );
});

// Triggered by Vercel Cron once a day (see vercel.json) via
// routes/cronRoutes.js, which checks CRON_SECRET before this ever runs.
const runContentIngestion = asyncHandler(async (req, res) => {
  const result = await ingestAllContent();
  return success(res, 200, 'Content ingestion finished.', result);
});

module.exports = { listContent, getTopCategories, runContentIngestion };
