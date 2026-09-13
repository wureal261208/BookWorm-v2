jest.mock('../models/BookMetadata');
jest.mock('../utils/gutenbergReader');

const BookMetadata = require('../models/BookMetadata');
const { fetchGutenbergReaderText } = require('../utils/gutenbergReader');
const { getBookAiContext } = require('../utils/bookAiContext');

function fakeBook(overrides) {
  return {
    chapters: [],
    sourceEtextNumber: null,
    readerUrl: '',
    ...overrides,
  };
}

describe('getBookAiContext', () => {
  afterEach(() => jest.clearAllMocks());

  test('a manually-typed chapter wins over any Gutenberg lookup', async () => {
    const book = fakeBook({
      chapters: [{ content: 'Once upon a time, in a chapter someone actually typed out by hand.' }],
      sourceEtextNumber: 42,
    });

    const result = await getBookAiContext(book);

    expect(BookMetadata.findOne).not.toHaveBeenCalled();
    expect(result.textExcerpt).toContain('Once upon a time');
    expect(result.readerUrlSuggestion).toBe('');
  });

  test('no sourceEtextNumber and no typed chapter: nothing to offer', async () => {
    const result = await getBookAiContext(fakeBook());
    expect(result).toEqual({ textExcerpt: '', readerUrlSuggestion: '' });
  });

  test('catalog-linked book: fetches an excerpt and suggests the reader URL when the book has none', async () => {
    BookMetadata.findOne = jest.fn().mockResolvedValue({
      readOnlineUrl: 'https://www.gutenberg.org/ebooks/42.html.images',
      plainTextUtf8Url: 'https://www.gutenberg.org/files/42/42-0.txt',
    });
    fetchGutenbergReaderText.mockResolvedValue('The full text of the book.');

    const result = await getBookAiContext(fakeBook({ sourceEtextNumber: 42, readerUrl: '' }));

    expect(result.textExcerpt).toBe('The full text of the book.');
    expect(result.readerUrlSuggestion).toBe('https://www.gutenberg.org/ebooks/42.html.images');
  });

  test('never suggests a reader URL when the book already has one', async () => {
    BookMetadata.findOne = jest.fn().mockResolvedValue({
      readOnlineUrl: 'https://www.gutenberg.org/ebooks/42.html.images',
    });
    fetchGutenbergReaderText.mockResolvedValue('Text.');

    const result = await getBookAiContext(fakeBook({ sourceEtextNumber: 42, readerUrl: 'https://existing.example/reader' }));

    expect(result.readerUrlSuggestion).toBe('');
  });

  test('a failed Gutenberg fetch still returns any readerUrlSuggestion, just no excerpt', async () => {
    BookMetadata.findOne = jest.fn().mockResolvedValue({ readOnlineUrl: 'https://www.gutenberg.org/ebooks/42.html.images' });
    fetchGutenbergReaderText.mockRejectedValue(new Error('network error'));

    const result = await getBookAiContext(fakeBook({ sourceEtextNumber: 42 }));

    expect(result.textExcerpt).toBe('');
    expect(result.readerUrlSuggestion).toBe('https://www.gutenberg.org/ebooks/42.html.images');
  });

  test('no matching metadata entry at all: nothing to offer', async () => {
    BookMetadata.findOne = jest.fn().mockResolvedValue(null);
    const result = await getBookAiContext(fakeBook({ sourceEtextNumber: 999 }));
    expect(result).toEqual({ textExcerpt: '', readerUrlSuggestion: '' });
  });
});
