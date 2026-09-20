jest.mock('../models/Book');
const Book = require('../models/Book');
const { listCategories } = require('../controllers/bookController');

function mockRes() { const res = {}; res.status = jest.fn().mockReturnValue(res); res.json = jest.fn().mockReturnValue(res); return res; }

describe('listCategories', () => {
  test('counts tags from the new categories array on approved books', async () => {
    Book.aggregate = jest.fn().mockResolvedValue([{ _id: 'Fiction', count: 500 }]);
    const res = mockRes();
    await listCategories({ query: {} }, res);
    expect(Book.aggregate).toHaveBeenCalledWith([
      { $match: { moderationStatus: 'approved' } }, { $unwind: '$categories' },
      { $group: { _id: '$categories', count: { $sum: 1 } } }, { $sort: { count: -1, _id: 1 } }, { $limit: 30 },
    ]);
    expect(res.json.mock.calls[0][0].data.categories).toEqual([{ name: 'Fiction', count: 500 }]);
  });
});
