jest.mock('../models/Book');

const Book = require('../models/Book');
const { listBooks } = require('../controllers/bookController');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

function setupChain() {
  const chain = { sort: jest.fn().mockReturnThis(), skip: jest.fn().mockReturnThis(), limit: jest.fn().mockResolvedValue([]) };
  Book.find = jest.fn().mockReturnValue(chain);
  Book.countDocuments = jest.fn().mockResolvedValue(0);
}

describe('listBooks new catalog filters', () => {
  test('only exposes approved catalog records and filters the categories array case-insensitively', async () => {
    setupChain();
    await listBooks({ query: { categories: 'history' } }, mockRes());
    const filter = Book.find.mock.calls[0][0];
    expect(filter.moderationStatus).toBe('approved');
    expect(filter.categories.$in[0]).toEqual(new RegExp('history', 'i'));
  });

  test('keeps category as a backward-compatible URL alias and escapes regex input', async () => {
    setupChain();
    await listBooks({ query: { category: 'Sci-Fi (2000+)' } }, mockRes());
    expect(Book.find.mock.calls[0][0].categories.$in[0]).toEqual(new RegExp('Sci-Fi \\(2000\\+\\)', 'i'));
  });

  test('supports type, language, source, and no category for "all"', async () => {
    setupChain();
    await listBooks({ query: { category: 'all', type: 'audiobook', language: 'EN', source: 'LibriVox' } }, mockRes());
    expect(Book.find).toHaveBeenCalledWith({ moderationStatus: 'approved', type: 'audiobook', language: 'en', source: 'LibriVox' });
  });

  test('uses random sampling for the legacy Random page without dropping new moderation filtering', async () => {
    Book.aggregate = jest.fn().mockResolvedValue([{ title: 'A' }]);
    Book.countDocuments = jest.fn().mockResolvedValue(1);
    Book.find = jest.fn();
    const res = mockRes();
    await listBooks({ query: { sort: 'random', limit: '16', category: 'History' } }, res);
    expect(Book.find).not.toHaveBeenCalled();
    expect(Book.aggregate).toHaveBeenCalledWith([
      { $match: { moderationStatus: 'approved', categories: { $in: [new RegExp('History', 'i')] } } },
      { $sample: { size: 16 } },
    ]);
    expect(res.json.mock.calls[0][0].data.books).toEqual([{ title: 'A' }]);
  });
});
