const Ebook = require('../models/Ebook');
const Audiobook = require('../models/Audiobook');
const asyncHandler = require('../utils/asyncHandler');
const { success } = require('../utils/response');
const { syncExternalCatalog } = require('../utils/externalCatalogSync');

// Public reads - straight from Mongo, never Gutendex/LibriVox live. This is
// the whole point of caching: a visitor's page load never waits on a
// third-party API, it only ever waits on your own database.
const listEbooks = asyncHandler(async (req, res) => {
  const ebooks = await Ebook.find({}).sort({ downloadCount: -1 }).lean();
  return success(res, 200, 'Ebooks fetched from cache.', ebooks);
});

const listAudiobooks = asyncHandler(async (req, res) => {
  const audiobooks = await Audiobook.find({}).sort({ lastSyncedAt: -1 }).lean();
  return success(res, 200, 'Audiobooks fetched from cache.', audiobooks);
});

// Triggered by Vercel Cron once a day (see vercel.json) via
// routes/cronRoutes.js, which checks CRON_SECRET before this ever runs.
const runCatalogSync = asyncHandler(async (req, res) => {
  const result = await syncExternalCatalog();
  return success(res, 200, 'Catalog sync finished.', result);
});

module.exports = { listEbooks, listAudiobooks, runCatalogSync };
