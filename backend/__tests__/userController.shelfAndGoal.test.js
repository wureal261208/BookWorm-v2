jest.mock('../models/User');
jest.mock('../models/Book');
jest.mock('../models/ReadingProgress');
jest.mock('../config/firebaseAdmin');
jest.mock('../utils/mailer');

const User = require('../models/User');
const ReadingProgress = require('../models/ReadingProgress');
const { getMyShelf, updateShelfStatus, removeShelfBook, updateReadingGoal } = require('../controllers/userController');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

function flush() {
  return new Promise((resolve) => setImmediate(resolve));
}

describe('userController shelf & goal', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('getMyShelf returns user shelf and readingGoal', async () => {
    const req = {
      user: {
        shelvedBooks: [{ bookId: 'b-1', status: 'reading' }],
        savedBooks: ['b-1'],
        readingGoal: 15,
      },
    };
    const res = mockRes();

    getMyShelf(req, res);
    await flush();

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.data.shelf).toHaveLength(1);
    expect(body.data.readingGoal).toBe(15);
  });

  test('updateReadingGoal validates range and saves new goal', async () => {
    const saveMock = jest.fn().mockResolvedValue(true);
    const req = {
      user: {
        readingGoal: 10,
        save: saveMock,
      },
      body: { goal: 20 },
    };
    const res = mockRes();

    updateReadingGoal(req, res);
    await flush();

    expect(saveMock).toHaveBeenCalled();
    expect(req.user.readingGoal).toBe(20);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.data.readingGoal).toBe(20);
  });

  test('updateReadingGoal rejects invalid goals', async () => {
    const req = {
      user: { readingGoal: 10, save: jest.fn() },
      body: { goal: -5 },
    };
    const res = mockRes();

    updateReadingGoal(req, res);
    await flush();

    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('updateShelfStatus validates status and updates MongoDB', async () => {
    User.findByIdAndUpdate = jest.fn().mockResolvedValue(true);
    const req = {
      user: {
        _id: 'u-1',
        shelvedBooks: [],
        savedBooks: [],
      },
      params: { bookId: 'book-99' },
      body: { status: 'reading' },
    };
    const res = mockRes();

    updateShelfStatus(req, res);
    await flush();

    expect(User.findByIdAndUpdate).toHaveBeenCalled();
    expect(req.user.shelvedBooks).toEqual([
      expect.objectContaining({ bookId: 'book-99', status: 'reading' }),
    ]);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
