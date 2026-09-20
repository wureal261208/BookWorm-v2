jest.mock('../models/Book');
jest.mock('../models/BookMetadata');
jest.mock('../models/User');
jest.mock('../models/Notification');
jest.mock('../utils/gutenbergReader');

const Book = require('../models/Book');
const { listMyBooks } = require('../controllers/bookController');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

function flush() {
  return new Promise((resolve) => setImmediate(resolve));
}

describe('listMyBooks', () => {
  test('sorts with an _id tiebreaker, not createdAt alone', async () => {
    // Regression test: a lot of books were bulk-imported in the same
    // millisecond, so createdAt ties are common. Without a fully
    // deterministic sort, MongoDB's skip/limit pagination isn't
    // guaranteed stable across separate requests - in practice this
    // showed up as the same book appearing on page 1, 2, and 3 of Book
    // Management. `_id` is always unique, so tie-breaking on it fixes
    // that regardless of how many books share a createdAt value.
    const sortMock = jest.fn().mockReturnThis();
    const chain = {
      select: jest.fn().mockReturnThis(),
      sort: sortMock,
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      populate: jest.fn().mockResolvedValue([]),
    };
    Book.find = jest.fn().mockReturnValue(chain);
    Book.countDocuments = jest.fn().mockResolvedValue(0);

    const req = { user: { _id: 'admin1', role: 'admin' }, query: { page: '1', limit: '20' } };
    listMyBooks(req, mockRes());
    await flush();

    expect(sortMock).toHaveBeenCalledWith({ createdAt: -1, _id: -1 });
  });
});
