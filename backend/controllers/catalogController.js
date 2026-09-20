const Ebook = require('../models/Ebook');
const Audiobook = require('../models/Audiobook');
const asyncHandler = require('../utils/asyncHandler');
const { success } = require('../utils/response');
const { syncExternalCatalog } = require('../utils/externalCatalogSync');

// Public reads - straight from Mongo, never Gutendex/LibriVox live. This is
// the whole point of caching: a visitor's page load never waits on a
// third-party API, it only ever waits on your own database.
const listEbooks = asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 200);
  const ebooks = await Ebook.find({}).sort({ downloadCount: -1 }).limit(limit).lean();

  // Reshaped to match Gutendex's own raw API (id, download_count,
  // media_type, ...) instead of this collection's camelCase Mongoose field
  // names - the frontend's existing bookUtils helpers (getAuthor, getCover,
  // getCategory) were already written around "Gutendex-shaped" objects, so
  // this way the Hot ebooks row needs zero special-casing to use them.
  const shaped = ebooks.map((book) => ({
    id: book.gutendexId,
    title: book.title,
    authors: book.authors,
    translators: book.translators,
    subjects: book.subjects,
    bookshelves: book.bookshelves,
    summaries: book.summaries,
    languages: book.languages,
    copyright: book.copyright,
    media_type: book.mediaType,
    formats: book.formats,
    download_count: book.downloadCount,
  }));

  return success(res, 200, 'Ebooks fetched from cache.', shaped);
});

const listAudiobooks = asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 200);
  // No real popularity signal exists in the LibriVox feed (no play/download
  // count like Gutendex's), so "hot" here is honestly just the feed's own
  // order rather than a fabricated ranking - same spirit as the "no fake
  // personalization" notes elsewhere in HomePage.jsx.
  const audiobooks = await Audiobook.find({}).limit(limit).lean();
  const shaped = audiobooks.map((book) => ({ ...book, id: book.librivoxId }));

  return success(res, 200, 'Audiobooks fetched from cache.', shaped);
});

// Triggered by Vercel Cron once a day (see vercel.json) via
// routes/cronRoutes.js, which checks CRON_SECRET before this ever runs.
const runCatalogSync = asyncHandler(async (req, res) => {
  const result = await syncExternalCatalog();
  return success(res, 200, 'Catalog sync finished.', result);
});

module.exports = { listEbooks, listAudiobooks, runCatalogSync };
