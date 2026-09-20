jest.mock('../models/Book');
jest.mock('../models/BookMetadata');
jest.mock('../models/Notification');
jest.mock('../models/User');
jest.mock('../utils/gutenbergReader');

const Book = require('../models/Book');
const { listCategories } = require('../controllers/bookController');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn();
  return res;
}

describe('listCategories', () => {
  test('only counts published books and sorts by count, most popular first', async () => {
    Book.aggregate = jest.fn().mockResolvedValue([
      { _id: 'Fiction', count: 500 },
      { _id: 'History', count: 120 },
    ]);

    const res = mockRes();
    await listCategories({ query: {} }, res);

    expect(Book.aggregate).toHaveBeenCalledWith([
      { $match: { status: 'published' } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 16 },
    ]);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Categories retrieved successfully.',
      data: {
        categories: [
          { name: 'Fiction', count: 500 },
          { name: 'History', count: 120 },
        ],
      },
    });
  });

  test('falls back to "General" for a null/empty category bucket', async () => {
    Book.aggregate = jest.fn().mockResolvedValue([{ _id: null, count: 7 }]);

    const res = mockRes();
    await listCategories({ query: {} }, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { categories: [{ name: 'General', count: 7 }] },
      }),
    );
  });
});
