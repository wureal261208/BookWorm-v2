const Book = require('../models/Book');
const asyncHandler = require('../utils/asyncHandler');
const { success, fail } = require('../utils/response');

function externalUrl(req, filename) {
  return `${req.protocol}://${req.get('host')}/uploads/${filename}`;
}

const uploadBook = asyncHandler(async (req, res) => {
  const bookFile = req.files?.bookFile?.[0];
  if (!bookFile) return fail(res, 400, 'A PDF, EPUB, or audio file is required.');
  if (!String(req.body.title || '').trim() || !String(req.body.author || '').trim()) {
    return fail(res, 400, 'title and author are required.');
  }
  const type = req.body.type;
  const isAudio = bookFile.mimetype.startsWith('audio/');
  if (!['ebook', 'audiobook'].includes(type) || (type === 'audiobook') !== isAudio) {
    return fail(res, 400, 'The selected type must match the uploaded file.');
  }
  const book = await Book.create({
    type,
    title: String(req.body.title || '').trim(),
    author: String(req.body.author || '').trim(),
    description: String(req.body.description || '').trim(),
    categories: String(req.body.categories || '').split(',').map((item) => item.trim()).filter(Boolean),
    language: String(req.body.language || 'en').trim().toLowerCase(),
    release_date: req.body.release_date || null,
    cover_image: req.files?.coverImage?.[0] ? externalUrl(req, req.files.coverImage[0].filename) : '',
    source: 'User',
    files: [{ format: bookFile.mimetype === 'application/pdf' ? 'pdf' : bookFile.mimetype === 'application/epub+zip' ? 'epub' : bookFile.mimetype.split('/')[1], url: externalUrl(req, bookFile.filename) }],
    moderationStatus: 'pending',
    uploadedBy: req.user._id,
  });
  return success(res, 201, 'Upload received and submitted for review.', { book });
});

function mapGutenberg(item) {
  const formats = item.formats || {};
  const files = Object.entries(formats)
    .filter(([format, url]) => /epub|pdf|text\/plain/i.test(format) && typeof url === 'string')
    .map(([format, url]) => ({ format: /epub/i.test(format) ? 'epub' : /pdf/i.test(format) ? 'pdf' : 'txt', url }));
  return { type: 'ebook', title: item.title, author: item.authors?.map((a) => a.name).join(', ') || 'Unknown', description: item.summaries?.[0] || '', categories: [...(item.bookshelves || []), ...(item.subjects || [])].slice(0, 8), language: item.languages?.[0] || 'en', cover_image: formats['image/jpeg'] || '', source: 'Gutenberg', files, externalId: String(item.id) };
}

function mapLibrivox(item) {
  const urls = [item.url_zip_file, item.url_other, item.url_rss].filter(Boolean);
  return { type: 'audiobook', title: item.title, author: item.authors?.map((a) => `${a.first_name || ''} ${a.last_name || ''}`.trim()).filter(Boolean).join(', ') || 'Unknown', description: item.description || '', categories: [], language: item.language || 'en', cover_image: '', source: 'LibriVox', files: urls.map((url) => ({ format: /rss/i.test(url) ? 'rss' : 'zip', url })), externalId: String(item.id) };
}

const searchExternalCatalog = asyncHandler(async (req, res) => {
  const query = String(req.query.q || '').trim();
  const source = req.query.source || 'all';
  if (!query) return fail(res, 400, 'q is required.');
  const requests = [];
  if (source === 'all' || source === 'Gutenberg') requests.push(fetch(`https://gutendex.com/books/?search=${encodeURIComponent(query)}`).then((r) => r.ok ? r.json() : { results: [] }).then((data) => data.results.slice(0, 10).map(mapGutenberg)));
  if (source === 'all' || source === 'LibriVox') requests.push(fetch(`https://librivox.org/api/feed/audiobooks/?title=${encodeURIComponent(query)}&format=json&limit=10`).then((r) => r.ok ? r.json() : { books: [] }).then((data) => (data.books || []).map(mapLibrivox)));
  const results = (await Promise.all(requests)).flat().filter((book) => book.files.length);
  return success(res, 200, 'External catalog results retrieved.', { books: results });
});

const importExternalBook = asyncHandler(async (req, res) => {
  const payload = req.body;
  if (!['Gutenberg', 'LibriVox'].includes(payload.source) || !payload.externalId) return fail(res, 400, 'A Gutenberg or LibriVox external record is required.');
  const existing = await Book.findOne({ source: payload.source, externalId: String(payload.externalId) });
  if (existing) return success(res, 200, 'Book is already in the catalog.', { book: existing, imported: false });
  const book = await Book.create({ ...payload, files: Array.isArray(payload.files) ? payload.files : [], moderationStatus: 'approved', uploadedBy: req.user._id, externalId: String(payload.externalId) });
  return success(res, 201, 'External book imported.', { book, imported: true });
});

module.exports = { uploadBook, searchExternalCatalog, importExternalBook };
