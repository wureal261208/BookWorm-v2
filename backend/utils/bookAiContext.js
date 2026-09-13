const BookMetadata = require('../models/BookMetadata');
const { fetchGutenbergReaderText } = require('./gutenbergReader');

const TEXT_EXCERPT_MAX_CHARS = 4000;

// Given a Book document (needs .chapters, .sourceEtextNumber, .readerUrl
// loaded), returns:
//   - textExcerpt: a real chunk of the book's own text to summarize from,
//     when one can be found - a manually-typed chapter takes priority
//     (it's exactly what the reader sees), otherwise the linked Gutenberg
//     entry's own text, fetched fresh. Empty string if neither is
//     available - the caller still has title/author/category to fall
//     back on, it just won't be as specific.
//   - readerUrlSuggestion: NOT AI-generated - a catalog-linked book's
//     Gutenberg entry always has a real reader URL on file already (see
//     book_metadata.readOnlineUrl), it just doesn't get copied onto the
//     Book document automatically. Only set when the book doesn't already
//     have one of its own.
//
// Used by both POST /api/books/:id/ai-fill (bookController.js) and the
// one-time backend/scripts/backfillBookDescriptions.js bulk job - this is
// the one place that logic lives, instead of two copies drifting apart.
async function getBookAiContext(book) {
  const typedChapter = book.chapters.find((chapter) => chapter.content);
  if (typedChapter) {
    return { textExcerpt: typedChapter.content.slice(0, TEXT_EXCERPT_MAX_CHARS), readerUrlSuggestion: '' };
  }

  if (!book.sourceEtextNumber) {
    return { textExcerpt: '', readerUrlSuggestion: '' };
  }

  const metadata = await BookMetadata.findOne({ etextNumber: book.sourceEtextNumber });
  if (!metadata) {
    return { textExcerpt: '', readerUrlSuggestion: '' };
  }

  const readerUrlSuggestion = !book.readerUrl ? (metadata.readOnlineUrl || metadata.plainTextUtf8Url || '') : '';

  if (!metadata.readOnlineUrl && !metadata.plainTextUtf8Url) {
    return { textExcerpt: '', readerUrlSuggestion };
  }

  try {
    const fullText = await fetchGutenbergReaderText({
      readOnlineUrl: metadata.readOnlineUrl,
      plainTextUtf8Url: metadata.plainTextUtf8Url,
    });
    return { textExcerpt: (fullText || '').slice(0, TEXT_EXCERPT_MAX_CHARS), readerUrlSuggestion };
  } catch {
    // Gutenberg fetch failed (network hiccup, page moved, etc.) - fall
    // through with no excerpt rather than fail the whole request/book.
    return { textExcerpt: '', readerUrlSuggestion };
  }
}

module.exports = { getBookAiContext, TEXT_EXCERPT_MAX_CHARS };
