jest.mock('../models/Book');
jest.mock('../models/BookMetadata');
jest.mock('../models/User');
jest.mock('../models/Notification');
jest.mock('../utils/gutenbergReader');
jest.mock('../utils/emailTemplates', () => ({
  sendBookApprovalEmail: jest.fn().mockResolvedValue(true),
  sendBookRejectionEmail: jest.fn().mockResolvedValue(true),
}));

const Book = require('../models/Book');
const Notification = require('../models/Notification');
const User = require('../models/User');
const { deleteMyBook, updateBook } = require('../controllers/bookController');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

function flush() {
  return new Promise((resolve) => setImmediate(resolve));
}

describe('deleteMyBook and rejection handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('deleteMyBook successfully deletes book owned by user', async () => {
    Book.findOneAndDelete = jest.fn().mockResolvedValue({ _id: 'book123', title: 'My Novel' });

    const req = {
      params: { id: 'book123' },
      user: { _id: 'user456', role: 'customer' },
    };
    const res = mockRes();

    deleteMyBook(req, res);
    await flush();

    expect(Book.findOneAndDelete).toHaveBeenCalledWith({ _id: 'book123', createdBy: 'user456' });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: 'Your book has been deleted successfully.',
      })
    );
  });

  test('deleteMyBook returns 404 when book not found or unauthorized', async () => {
    Book.findOneAndDelete = jest.fn().mockResolvedValue(null);

    const req = {
      params: { id: 'book999' },
      user: { _id: 'user456', role: 'customer' },
    };
    const res = mockRes();

    deleteMyBook(req, res);
    await flush();

    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('updateBook saves rejectionReason and dispatches Notification when hidden', async () => {
    const mockBook = {
      _id: 'book123',
      title: 'Suspicious Book',
      author: 'Jane Doe',
      status: 'draft',
      createdBy: 'author789',
      rejectionReason: '',
      save: jest.fn().mockResolvedValue(true),
    };

    Book.findById = jest.fn().mockResolvedValue(mockBook);
    Notification.create = jest.fn().mockResolvedValue({});
    User.findById = jest.fn().mockReturnValue({
      select: jest.fn().mockResolvedValue({ _id: 'author789', name: 'Jane', email: 'jane@example.com' }),
    });

    const req = {
      params: { id: 'book123' },
      body: { status: 'hidden', rejectionReason: 'Inappropriate content' },
      user: { _id: 'admin1', role: 'admin' },
    };
    const res = mockRes();

    updateBook(req, res);
    await flush();

    expect(mockBook.status).toBe('hidden');
    expect(mockBook.rejectionReason).toBe('Inappropriate content');
    expect(mockBook.save).toHaveBeenCalled();
    expect(Notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Book Submission Review',
        audience: 'user',
        user: 'author789',
      })
    );
  });
});
