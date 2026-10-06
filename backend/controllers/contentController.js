const mongoose = require('mongoose');
const Content = require('../models/Content');
const Book = require('../models/Book');
const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');
const { success, fail } = require('../utils/response');
const { ingestAllContent } = require('../utils/contentIngestion');
const { parseLibrivoxChapters } = require('../utils/librivoxRssParser');
const { fetchGutenbergParagraphs } = require('../utils/gutenbergReader');
const { splitParagraphsIntoChapters } = require('../utils/chapterSplitter');
const escapeRegExp = require('../utils/escapeRegExp');

async function findContentById(id, extra = {}) {
  if (!id) return null;
  const isObjId = mongoose.Types.ObjectId.isValid(id);
  const query = isObjId
    ? { $or: [{ _id: id }, { externalId: String(id) }], ...extra }
    : { externalId: String(id), ...extra };
  return Content.findOne(query).lean();
}

async function findBookById(id, extra = {}) {
  if (!id) return null;
  const isObjId = mongoose.Types.ObjectId.isValid(id);
  const num = Number(id);
  const conditions = [];
  if (isObjId) conditions.push({ _id: id });
  if (Number.isInteger(num) && num > 0) conditions.push({ sourceEtextNumber: num });
  if (!conditions.length) return null;
  const query = conditions.length === 1 ? { ...conditions[0], ...extra } : { $or: conditions, ...extra };
  return Book.findOne(query).lean();
}

// In-memory cache & request deduplication for LibriVox RSS feeds
const librivoxChaptersCache = new Map();
const librivoxInFlight = new Map();
const LIBRIVOX_CACHE_TTL_MS = 1000 * 60 * 60 * 24; // 24 hours
const MAX_LIBRIVOX_CACHE = 120;

// Public reads - only ever published content, straight from Mongo. User
// uploads sit as status:'draft' until an admin publishes or hides them
// (see createUserContent below and contentAdminController.js's existing
// Publish/Hide actions) and never show up here until then.
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

  if (req.query.sort === 'hot') {
    filter.$or = [
      { source: { $in: ['Gutenberg', 'LibriVox'] } },
      { source: 'User', downloadCount: { $gte: 1000 } },
      { source: 'User', views: { $gte: 1000 } },
    ];
  }

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
const VALID_TYPES = ['ebook', 'audiobook'];

// @route POST /api/content
// @desc  Community crowd-narration/upload (see CommunityPage.jsx) - a
//        logged-in reader submits a title with at least one file link
//        (their own hosted audio for a book LibriVox doesn't have narrated
//        yet, most often). Lands as status:'draft', invisible to the
//        public until an admin publishes it from the existing Book
//        Management > Synced content panel (contentAdminController.js) -
//        no new admin UI needed, drafts already show up there.
// @access Any logged-in user (protect only, no role check)
const createUserContent = asyncHandler(async (req, res) => {
  const title = (req.body.title || '').trim();
  const type = req.body.type;
  const files = Array.isArray(req.body.files) ? req.body.files.filter((file) => file && file.format && file.url) : [];

  if (!title) return fail(res, 400, 'title is required.');
  if (!VALID_TYPES.includes(type)) return fail(res, 400, `type must be one of: ${VALID_TYPES.join(', ')}`);
  if (!files.length) return fail(res, 400, 'At least one file (format + url) is required.');

  const content = await Content.create({
    type,
    title,
    author: (req.body.author || '').trim() || 'Unknown author',
    description: (req.body.description || '').trim(),
    categories: Array.isArray(req.body.categories) ? req.body.categories.filter((category) => typeof category === 'string' && category.trim()) : [],
    language: (req.body.language || '').trim() || 'en',
    source: 'User',
    files,
    status: 'draft',
    uploadedBy: req.user._id,
    // externalId is deliberately left unset (not null) - the sparse
    // unique index on {source, externalId} only excludes documents where
    // the field is genuinely absent, and User uploads have no external
    // catalog id to dedupe against.
  });

  return success(res, 201, 'Submitted for review.', content);
});

// @route GET /api/content/mine
// @desc  A reader's own submissions, whatever their current status, so
//        they can see what happened after submitting (see
//        CommunityPage.jsx's "Your submissions" list).
const listMyContent = asyncHandler(async (req, res) => {
  const items = await Content.find({ uploadedBy: req.user._id }).sort({ createdAt: -1 }).lean();
  return success(res, 200, 'Your submissions fetched.', items);
});

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
  let item = await findContentById(req.params.id, { status: 'published' });

  if (!item) {
    const book = await findBookById(req.params.id, { status: 'published' });
    if (book) {
      const isAudiobook = book.category === 'Audiobook' || book.title.toLowerCase().includes('(audiobook)');
      const baseTitle = book.title.replace(/\s*\(Audiobook\)\s*/i, '').trim();
      let pairedContent = null;
      const normalizedTitle = normalizeTitle(baseTitle);

      if (normalizedTitle.length > 3) {
        const otherType = isAudiobook ? 'ebook' : 'audiobook';
        const match = await Content.findOne({
          status: 'published',
          type: otherType,
          title: { $regex: new RegExp(escapeRegExp(baseTitle), 'i') },
        }).select('title type').lean();
        if (match) pairedContent = { id: match._id, type: match.type };
      }

      let files = [];
      if (isAudiobook) {
        const audioContent = await Content.findOne({
          status: 'published',
          type: 'audiobook',
          title: { $regex: new RegExp(escapeRegExp(baseTitle), 'i') },
        }).lean();
        if (audioContent?.files?.length) {
          files = audioContent.files;
        }
      } else if (book.readerUrl) {
        files = [{ format: 'html', url: book.readerUrl }];
      }

      item = {
        _id: book._id,
        id: book._id,
        title: book.title,
        author: book.author,
        description: book.description,
        cover_image: book.coverUrl,
        source: isAudiobook ? 'LibriVox' : (book.sourceEtextNumber ? 'Gutenberg' : 'BookWorm'),
        type: isAudiobook ? 'audiobook' : 'ebook',
        files,
        categories: [book.category, ...(book.subjects || [])],
        language: book.language || 'en',
        pairedContent,
        downloadCount: book.views || 0,
        views: book.views || 0,
        status: book.status,
      };
      return success(res, 200, 'Content detail fetched.', item);
    }
    return fail(res, 404, 'Content not found.');
  }

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

// @route GET /api/content/:id/text
// @desc  Public - powers the in-app margin-notes reader (see ContentReaderPage.jsx).
//        Supports both Content documents and Book documents from the catalog.
const getContentText = asyncHandler(async (req, res) => {
  let item = await findContentById(req.params.id, { status: 'published' });
  let book = null;

  if (!item) {
    book = await findBookById(req.params.id, { status: 'published' });
    if (!book) return fail(res, 404, 'Content not found.');
  }

  // If item is an audiobook, resolve matching ebook text for Read-Along subtitles
  if (item && item.type === 'audiobook') {
    const baseTitle = item.title.replace(/\s*\(Audiobook\)\s*/i, '').trim();
    const matchingEbook = await Content.findOne({
      type: 'ebook',
      status: 'published',
      title: { $regex: new RegExp(escapeRegExp(baseTitle), 'i') },
    }).lean();
    if (matchingEbook) {
      item = matchingEbook;
    }
  }

  // If Book has explicit chapters with content
  if (book && Array.isArray(book.chapters) && book.chapters.some((ch) => ch.content)) {
    const paragraphs = [];
    book.chapters.forEach((ch, chIdx) => {
      paragraphs.push(ch.title || `Chapter ${chIdx + 1}`);
      if (ch.content) {
        const parts = ch.content.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
        paragraphs.push(...parts);
      }
    });
    return success(res, 200, 'Text fetched.', { paragraphs });
  }

  let readOnlineUrl = null;
  let plainTextUtf8Url = null;

  if (item) {
    const htmlFile = (item.files || []).find((file) => file.format === 'html');
    const txtFile = (item.files || []).find((file) => file.format === 'txt');
    readOnlineUrl = htmlFile?.url;
    plainTextUtf8Url = txtFile?.url;
  } else if (book) {
    readOnlineUrl = book.readerUrl;
    if (book.sourceEtextNumber) {
      if (!readOnlineUrl) {
        readOnlineUrl = `https://www.gutenberg.org/ebooks/${book.sourceEtextNumber}.html.images`;
      }
      plainTextUtf8Url = `https://www.gutenberg.org/cache/epub/${book.sourceEtextNumber}/pg${book.sourceEtextNumber}.txt`;
    }

    if (!readOnlineUrl && !plainTextUtf8Url) {
      const match = await Content.findOne({
        title: { $regex: new RegExp(escapeRegExp(book.title), 'i') },
        type: 'ebook',
        status: 'published',
      }).lean();
      if (match) {
        const htmlFile = (match.files || []).find((file) => file.format === 'html');
        const txtFile = (match.files || []).find((file) => file.format === 'txt');
        readOnlineUrl = htmlFile?.url;
        plainTextUtf8Url = txtFile?.url;
      }
    }
  }

  if (!readOnlineUrl && !plainTextUtf8Url) {
    return fail(res, 404, 'No readable text file recorded for this book.');
  }

  try {
    const paragraphs = await fetchGutenbergParagraphs({ readOnlineUrl, plainTextUtf8Url });
    return success(res, 200, 'Text fetched.', { paragraphs });
  } catch (error) {
    const desc = (item?.description || book?.description || '').trim();
    const parts = desc ? desc.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean) : [];
    const fallbackParas =
      parts.length > 0
        ? ['[Notice: Project Gutenberg mirror is currently synchronizing this title. Below is the book overview.]', ...parts]
        : ['[Notice: Project Gutenberg mirror is currently synchronizing this title. Please check back shortly or download the offline file.]'];
    return success(res, 200, 'Text fetched (preview mode).', { paragraphs: fallbackParas, isPreview: true });
  }
});

// @route GET /api/content/:id/chapters
// @desc  Public - backs in-app audiobook player chapter list & ebook chapter list.
//        Supports both Content documents and Book documents from the catalog.
const getAudiobookChapters = asyncHandler(async (req, res) => {
  let item = await findContentById(req.params.id, { status: 'published' });
  let book = null;

  if (!item) {
    book = await findBookById(req.params.id, { status: 'published' });
    if (!book) return fail(res, 404, 'Content not found.');
  }

  const isAudiobook = item
    ? item.type === 'audiobook'
    : (book.category === 'Audiobook' || book.title.toLowerCase().includes('(audiobook)'));

  if (!isAudiobook) {
    let readOnlineUrl = null;
    let plainTextUtf8Url = null;
    const bookTitle = item?.title || book?.title || 'Untitled';

    if (book && Array.isArray(book.chapters) && book.chapters.some((ch) => ch.content)) {
      const chapters = book.chapters.map((ch, idx) => ({
        order: ch.number || idx + 1,
        title: ch.title || `Chapter ${idx + 1}`,
        startParagraph: 0,
        excerpt: (ch.content || '').slice(0, 100),
      }));
      return success(res, 200, 'Chapters fetched.', { chapters, totalParagraphs: chapters.length });
    }

    if (item) {
      const htmlFile = (item.files || []).find((file) => file.format === 'html');
      const txtFile = (item.files || []).find((file) => file.format === 'txt');
      readOnlineUrl = htmlFile?.url;
      plainTextUtf8Url = txtFile?.url;
    } else if (book) {
      readOnlineUrl = book.readerUrl;
      if (book.sourceEtextNumber) {
        if (!readOnlineUrl) readOnlineUrl = `https://www.gutenberg.org/ebooks/${book.sourceEtextNumber}.html.images`;
        plainTextUtf8Url = `https://www.gutenberg.org/cache/epub/${book.sourceEtextNumber}/pg${book.sourceEtextNumber}.txt`;
      }
    }

    if (!readOnlineUrl && !plainTextUtf8Url) {
      return fail(res, 404, 'No readable text file recorded for this book.');
    }

    try {
      const paragraphs = await fetchGutenbergParagraphs({ readOnlineUrl, plainTextUtf8Url });
      const chapters = splitParagraphsIntoChapters(paragraphs, bookTitle);
      return success(res, 200, 'Chapters fetched.', { chapters, totalParagraphs: paragraphs.length });
    } catch (error) {
      const desc = item?.description || book?.description || '';
      const fallbackChapters = [
        {
          order: 1,
          title: bookTitle,
          startParagraph: 0,
          excerpt: desc.slice(0, 100),
        },
      ];
      return success(res, 200, 'Chapters fetched (fallback).', {
        chapters: fallbackChapters,
        totalParagraphs: 1,
        isFallback: true,
      });
    }
  }

  let rssUrl = (item?.files || []).find((file) => file.format === 'rss')?.url;
  if (!rssUrl && item?.externalId) {
    rssUrl = `https://librivox.org/rss/${item.externalId}`;
  }

  if (!rssUrl && book) {
    const baseTitle = book.title.replace(/\s*\(Audiobook\)\s*/i, '').trim();
    const audioContent = await Content.findOne({
      type: 'audiobook',
      status: 'published',
      title: { $regex: new RegExp(escapeRegExp(baseTitle), 'i') },
    }).lean();
    if (audioContent) {
      rssUrl = (audioContent.files || []).find((file) => file.format === 'rss')?.url;
      if (!rssUrl && audioContent.externalId) {
        rssUrl = `https://librivox.org/rss/${audioContent.externalId}`;
      }
    }
  }

  if (!rssUrl) {
    const allFiles = [...(item?.files || []), ...(book?.files || [])];
    const mp3Files = allFiles.filter((file) => file && file.format === 'mp3');
    if (mp3Files.length > 0) {
      const fallbackChapters = mp3Files.map((file, idx) => ({
        order: idx + 1,
        title: mp3Files.length === 1 ? (item?.title || book?.title || 'Full Audiobook') : `Part ${idx + 1}`,
        url: file.url,
        duration: '',
      }));
      return success(res, 200, 'Chapters fetched from audio files.', { chapters: fallbackChapters });
    }
    return fail(res, 404, 'No RSS feed or audio files recorded for this audiobook.');
  }

  // Check in-memory LibriVox cache
  const cachedEntry = librivoxChaptersCache.get(rssUrl);
  if (cachedEntry && Date.now() < cachedEntry.expiresAt) {
    return success(res, 200, 'Chapters fetched from cache.', { chapters: cachedEntry.chapters });
  }

  // Deduplicate in-flight requests or execute fetch with timeout
  let chapters = [];
  try {
    if (librivoxInFlight.has(rssUrl)) {
      chapters = await librivoxInFlight.get(rssUrl);
    } else {
      const fetchPromise = (async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 6500);
        try {
          const response = await fetch(rssUrl, {
            signal: controller.signal,
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 BookWorm-v2/1.0',
            },
          });
          if (!response.ok) throw new Error(`RSS request failed with status ${response.status}`);
          const xml = await response.text();
          return parseLibrivoxChapters(xml);
        } finally {
          clearTimeout(timeout);
        }
      })();
      librivoxInFlight.set(rssUrl, fetchPromise);
      try {
        chapters = await fetchPromise;
      } finally {
        librivoxInFlight.delete(rssUrl);
      }
    }

    if (Array.isArray(chapters) && chapters.length > 0) {
      if (librivoxChaptersCache.size >= MAX_LIBRIVOX_CACHE) {
        const oldestKey = librivoxChaptersCache.keys().next().value;
        librivoxChaptersCache.delete(oldestKey);
      }
      librivoxChaptersCache.set(rssUrl, {
        chapters,
        expiresAt: Date.now() + LIBRIVOX_CACHE_TTL_MS,
      });
      return success(res, 200, 'Chapters fetched.', { chapters });
    }
  } catch (error) {
    const allFiles = [...(item?.files || []), ...(book?.files || [])];
    const mp3Files = allFiles.filter((file) => file && file.format === 'mp3');
    if (mp3Files.length > 0) {
      const fallbackChapters = mp3Files.map((file, idx) => ({
        order: idx + 1,
        title: mp3Files.length === 1 ? (item?.title || book?.title || 'Full Audiobook') : `Part ${idx + 1}`,
        url: file.url,
        duration: '',
      }));
      return success(res, 200, 'Chapters fetched from audio files.', { chapters: fallbackChapters });
    }

    return success(res, 200, 'Chapters list unavailable.', { chapters: [], error: error.message });
  }

  return success(res, 200, 'Chapters fetched.', { chapters });
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

// @route GET /api/content/for-you
// @desc  Requires login - blends a reader's explicit preferredCategories
//        (from onboarding/Profile) with their real categoryEngagement
//        (what they've actually opened - see recordCategoryEngagement in
//        authController.js), weighting real behavior a bit higher since
//        it's a stronger signal than a one-time signup pick. Falls back to
//        overall top categories for a reader with neither yet, rather than
//        an empty row.
const getForYou = asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 16, 40);

  const engagementEntries = req.user?.categoryEngagement ? [...req.user.categoryEngagement.entries()] : [];
  const scored = new Map();
  for (const category of req.user?.preferredCategories || []) {
    scored.set(category, (scored.get(category) || 0) + 2);
  }
  for (const [category, count] of engagementEntries) {
    scored.set(category, (scored.get(category) || 0) + count * 3);
  }

  let topCategories = [...scored.entries()].sort((a, b) => b[1] - a[1]).map(([category]) => category);

  if (!topCategories.length) {
    const fallback = await Content.aggregate([
      { $match: { status: 'published' } },
      { $unwind: '$categories' },
      { $group: { _id: '$categories', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 },
    ]);
    topCategories = fallback.map((entry) => entry._id);
  }

  if (!topCategories.length) {
    return success(res, 200, 'For You fetched.', []);
  }

  const items = await Content.find({ status: 'published', categories: { $regex: topCategories.slice(0, 8).join('|'), $options: 'i' } })
    .sort({ downloadCount: -1 })
    .limit(limit)
    .lean();

  return success(res, 200, 'For You fetched.', items);
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

// Triggered when a reader opens or dwells on an ebook/audiobook
const incrementContentViews = asyncHandler(async (req, res) => {
  const isObjId = mongoose.Types.ObjectId.isValid(req.params.id);
  const num = Number(req.params.id);

  let content = await Content.findOneAndUpdate(
    isObjId ? { $or: [{ _id: req.params.id }, { externalId: String(req.params.id) }] } : { externalId: String(req.params.id) },
    { $inc: { views: 1 } },
    { new: true, select: 'views downloadCount' }
  );

  if (!content && (isObjId || (Number.isInteger(num) && num > 0))) {
    const book = await Book.findOneAndUpdate(
      isObjId ? { _id: req.params.id } : { sourceEtextNumber: num },
      { $inc: { views: 1 } },
      { new: true, select: 'views' }
    );
    if (book) {
      if (req.user) {
        await User.findByIdAndUpdate(req.user._id, { $inc: { booksReadCount: 1 } });
      }
      return success(res, 200, 'View recorded.', { views: book.views });
    }
  }

  if (!content) {
    return fail(res, 404, 'Content not found.');
  }

  if (req.user) {
    await User.findByIdAndUpdate(req.user._id, { $inc: { booksReadCount: 1 } });
  }

  return success(res, 200, 'View recorded.', { views: content.views });
});

// Triggered by Vercel Cron once a day (see vercel.json) via
// routes/cronRoutes.js, which checks CRON_SECRET before this ever runs.
const runContentIngestion = asyncHandler(async (req, res) => {
  const result = await ingestAllContent();
  return success(res, 200, 'Content ingestion finished.', result);
});

module.exports = {
  listContent,
  createUserContent,
  listMyContent,
  getPublicContentDetail,
  getContentText,
  getAudiobookChapters,
  searchAuthors,
  getTopCategories,
  getLanguageFacets,
  getForYou,
  runContentIngestion,
  incrementContentViews,
};
