jest.mock('../models/BookMetadata');
jest.mock('../models/Book');

const BookMetadata = require('../models/BookMetadata');
const Book = require('../models/Book');
const { searchBookMetadata } = require('../controllers/bookMetadataController');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

function entry(etextNumber, title) {
  return { etextNumber, title, toObject() { return { etextNumber, title }; } };
}

function flush() {
  return new Promise((resolve) => setImmediate(resolve));
}

describe('searchBookMetadata', () => {
  afterEach(() => jest.clearAllMocks());

  test('page 1: tags alreadyAdded and lists not-yet-added entries first', async () => {
    // Relevance order from Mongo: 1 (added), 2 (added), 3 (new), 4 (new).
    const candidates = [entry(1, 'Already One'), entry(2, 'Already Two'), entry(3, 'New Three'), entry(4, 'New Four')];
    BookMetadata.find = jest.fn().mockReturnValue({
      skip: jest.fn().mockReturnValue({ limit: jest.fn().mockReturnValue({ sort: jest.fn().mockResolvedValue(candidates) }) }),
    });
    BookMetadata.countDocuments = jest.fn().mockResolvedValue(4);
    Book.distinct = jest.fn().mockResolvedValue([1, 2]);

    const res = mockRes();
    searchBookMetadata({ query: { q: 'test', page: '1', limit: '4' } }, res);
    await flush();

    const payload = res.json.mock.calls[0][0];
    expect(payload.data.results.map((r) => r.etextNumber)).toEqual([3, 4, 1, 2]);
    expect(payload.data.results.find((r) => r.etextNumber === 1).alreadyAdded).toBe(true);
    expect(payload.data.results.find((r) => r.etextNumber === 3).alreadyAdded).toBe(false);
  });

  test('pulls a larger candidate pool on page 1 so reordering has room to work with', async () => {
    const limitMock = jest.fn().mockReturnValue({ sort: jest.fn().mockResolvedValue([]) });
    BookMetadata.find = jest.fn().mockReturnValue({ skip: jest.fn().mockReturnValue({ limit: limitMock }) });
    BookMetadata.countDocuments = jest.fn().mockResolvedValue(0);
    Book.distinct = jest.fn().mockResolvedValue([]);

    const res = mockRes();
    searchBookMetadata({ query: { q: 'x', page: '1', limit: '6' } }, res);
    await flush();

    expect(limitMock).toHaveBeenCalledWith(30); // min(100, 6*5)
  });

  test('page 2+ keeps plain relevance order and the requested limit as the pool size', async () => {
    const candidates = [entry(5, 'Five'), entry(6, 'Six')];
    const limitMock = jest.fn().mockReturnValue({ sort: jest.fn().mockResolvedValue(candidates) });
    BookMetadata.find = jest.fn().mockReturnValue({ skip: jest.fn().mockReturnValue({ limit: limitMock }) });
    BookMetadata.countDocuments = jest.fn().mockResolvedValue(20);
    Book.distinct = jest.fn().mockResolvedValue([5]);

    const res = mockRes();
    searchBookMetadata({ query: { q: 'x', page: '2', limit: '6' } }, res);
    await flush();

    expect(limitMock).toHaveBeenCalledWith(6);
    const payload = res.json.mock.calls[0][0];
    expect(payload.data.results.map((r) => r.etextNumber)).toEqual([5, 6]);
  });
});
