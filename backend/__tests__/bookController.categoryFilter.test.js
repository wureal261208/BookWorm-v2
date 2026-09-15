jest.mock('../models/Book');
jest.mock('../models/BookMetadata');
jest.mock('../models/Notification');
jest.mock('../models/User');
jest.mock('../utils/gutenbergReader');

const Book = require('../models/Book');
const { listBooks } = require('../controllers/bookController');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn();
  return res;
}

function flush() {
  return new Promise((resolve) => setImmediate(resolve));
}

describe('listBooks category filter', () => {
  function setupChain() {
    const chain = {
      select: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([]),
    };
    Book.find = jest.fn().mockReturnValue(chain);
    Book.countDocuments = jest.fn().mockResolvedValue(0);
    return chain;
  }

  test('does a case-insensitive partial match, not an exact match', async () => {
    setupChain();
    listBooks({ query: { category: 'history' } }, mockRes());
    await flush();

    expect(Book.find).toHaveBeenCalledWith({
      status: 'published',
      category: { $regex: 'history', $options: 'i' },
    });
  });

  test('escapes regex special characters in the category value', async () => {
    setupChain();
    listBooks({ query: { category: 'Sci-Fi (2000+)' } }, mockRes());
    await flush();

    expect(Book.find).toHaveBeenCalledWith({
      status: 'published',
      category: { $regex: 'Sci-Fi \\(2000\\+\\)', $options: 'i' },
    });
  });

  test('"all" (or no category) skips the filter entirely', async () => {
    setupChain();
    listBooks({ query: { category: 'all' } }, mockRes());
    await flush();

    expect(Book.find).toHaveBeenCalledWith({ status: 'published' });
  });
});
