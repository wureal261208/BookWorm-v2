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

  const filter = { status: 'approved' };
  if (type === 'ebook' || type === 'audiobook') filter.type = type;
  if (category) filter.categories = category;
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

// Triggered by Vercel Cron once a day (see vercel.json) via
// routes/cronRoutes.js, which checks CRON_SECRET before this ever runs.
const runContentIngestion = asyncHandler(async (req, res) => {
  const result = await ingestAllContent();
  return success(res, 200, 'Content ingestion finished.', result);
});

module.exports = { listContent, runContentIngestion };
