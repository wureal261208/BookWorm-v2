const Content = require('../models/Content');
const asyncHandler = require('../utils/asyncHandler');
const { success, fail } = require('../utils/response');
const { ingestAllContent } = require('../utils/contentIngestion');
const { parseLibrivoxChapters } = require('../utils/librivoxRssParser');

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

// Public, no auth - powers the in-app reader/player pages. Only ever
// returns published content, same as listContent above - a draft/hidden
// item 404s here exactly like it's missing, rather than leaking its
// existence to a visitor who isn't an admin.
// Loose title match for pairing an ebook with its audiobook (or vice
// versa) - Gutenberg and LibriVox format titles slightly differently (e.g.
// trailing subtitles, punctuation), so this strips everything down to bare
// alphanumerics before comparing rather than requiring an exact match.
function normalizeTitle(title) {
  return (title || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

const getPublicContentDetail = asyncHandler(async (req, res) => {
  const item = await Content.findOne({ _id: req.params.id, status: 'published' }).lean();
  if (!item) return fail(res, 404, 'Content not found.');

  // "Also available as..." cross-link (see nhóm 1's simpler, actually
  // buildable version of the ebook<->audiobook pairing idea - a real
  // position-synced switch would need the two sources to share some
  // notion of chapter/paragraph alignment, which neither Gutendex nor
  // LibriVox provide, so this only ever offers "open the other version",
  // not "resume at the same spot"). Only bothers checking when there's a
  // reasonably specific title to match on - a one- or two-character title
  // would false-positive against unrelated books.
  let pairedContent = null;
  const normalizedTitle = normalizeTitle(item.title);
  if (normalizedTitle.length > 3) {
    const otherType = item.type === 'ebook' ? 'audiobook' : 'ebook';
    const candidates = await Content.find({ status: 'published', type: otherType }).select('title type').lean();
    const match = candidates.find((candidate) => normalizeTitle(candidate.title) === normalizedTitle);
    if (match) pairedContent = { id: match._id, type: match.type };
  }

  return success(res, 200, 'Content detail fetched.', { ...item, pairedContent });
});

// Public, no auth - backs the in-app audiobook player's chapter list.
// Fetches the item's own RSS file live (LibriVox doesn't hand back
// per-chapter mp3 URLs anywhere in the cached Content document - the
// ingestion pipeline only keeps the whole-book zip + the RSS URL itself,
// see contentIngestion.js) and parses it on the spot rather than caching
// the chapter list in Mongo, since RSS parsing is cheap and this keeps the
// Content documents themselves small.
const getAudiobookChapters = asyncHandler(async (req, res) => {
  const item = await Content.findOne({ _id: req.params.id, status: 'published' }).lean();
  if (!item) return fail(res, 404, 'Content not found.');
  if (item.type !== 'audiobook') return fail(res, 400, 'Chapters are only available for audiobooks.');

  const rssFile = (item.files || []).find((file) => file.format === 'rss');
  if (!rssFile) return fail(res, 404, 'No RSS feed recorded for this audiobook.');

  try {
    const response = await fetch(rssFile.url);
    if (!response.ok) throw new Error(`RSS request failed with status ${response.status}`);
    const xml = await response.text();
    const chapters = parseLibrivoxChapters(xml);
    return success(res, 200, 'Chapters fetched.', { chapters });
  } catch (error) {
    return fail(res, 502, `Could not load chapters: ${error.message}`);
  }
});

// Public, no auth - backs the search page's "Authors" tab (see
// SearchPage.jsx). There are no real browsable user profiles on this site,
// so - per Wun's call - this tab searches Content authors instead of
// accounts; nothing here is account/user data, so there's no privacy
// concern with exposing it.
const searchAuthors = asyncHandler(async (req, res) => {
  const q = (req.query.q || '').trim();
  const limit = Math.min(Number(req.query.limit) || 20, 50);
  if (!q) return success(res, 200, 'Authors fetched.', []);

  const results = await Content.aggregate([
    { $match: { status: 'published', author: { $regex: q, $options: 'i' } } },
    { $group: { _id: '$author', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: limit },
  ]);

  return success(
    res,
    200,
    'Authors fetched.',
    results.map((entry) => ({ author: entry._id, count: entry.count })),
  );
});

// Public, no auth - backs the search page's language facet. Gutendex uses
// short codes ('en') and LibriVox uses full names ('English') for the same
// language, so this list is real but not fully normalized across sources -
// flagged here rather than silently pretending they're unified.
const getLanguageFacets = asyncHandler(async (req, res) => {
  const results = await Content.aggregate([
    { $match: { status: 'published' } },
    { $group: { _id: '$language', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 30 },
  ]);

  return success(
    res,
    200,
    'Languages fetched.',
    results.filter((entry) => entry._id).map((entry) => ({ language: entry._id, count: entry.count })),
  );
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

module.exports = {
  listContent,
  getPublicContentDetail,
  getAudiobookChapters,
  searchAuthors,
  getTopCategories,
  getLanguageFacets,
  runContentIngestion,
};
