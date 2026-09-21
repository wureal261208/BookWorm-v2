const asyncHandler = require('../utils/asyncHandler');
const { success, fail } = require('../utils/response');
const { fetchLibrivoxAudiobooks } = require('../utils/librivoxFetcher');

// Live pass-through preview of LibriVox's own catalog, shaped for the
// frontend - does NOT touch MongoDB. For what actually powers the site
// (Hot audiobooks, Book Management), see GET /api/content and
// utils/contentIngestion.js, which cache this same shape in Mongo instead
// of hitting LibriVox on every request.
const previewLibrivoxAudiobooks = asyncHandler(async (req, res) => {
  const limit = req.query.limit;
  const offset = req.query.offset;

  try {
    const audiobooks = await fetchLibrivoxAudiobooks({ limit, offset });
    return success(res, 200, 'LibriVox audiobooks fetched live.', audiobooks);
  } catch (error) {
    return fail(res, 502, `Could not reach LibriVox: ${error.message}`);
  }
});

module.exports = { previewLibrivoxAudiobooks };
