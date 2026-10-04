jest.mock('../models/Comment');
jest.mock('../models/User');
jest.mock('../models/Book');
jest.mock('../models/Content');

const Comment = require('../models/Comment');
const {
  listCommentsForAdmin,
  deleteCommentForAdmin,
} = require('../controllers/adminCommentController');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

function flush() {
  return new Promise((resolve) => setImmediate(resolve));
}

describe('adminCommentController', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('listCommentsForAdmin', () => {
    test('returns paginated comments with populated user and target information', async () => {
      const mockComments = [
        {
          _id: 'comment-1',
          text: 'This book was amazing!',
          createdAt: new Date('2026-10-04T10:00:00Z'),
          user: { _id: 'u1', name: 'Reader One', email: 'reader1@example.com', role: 'customer' },
          book: { _id: 'b1', title: 'The Great Story', author: 'Author A', coverImage: 'cover.jpg' },
          content: null,
        },
      ];

      Comment.countDocuments = jest.fn().mockResolvedValue(1);

      const populate3Mock = jest.fn().mockResolvedValue(mockComments);
      const populate2Mock = jest.fn().mockReturnValue({ populate: populate3Mock });
      const populate1Mock = jest.fn().mockReturnValue({ populate: populate2Mock });
      const limitMock = jest.fn().mockReturnValue({ populate: populate1Mock });
      const skipMock = jest.fn().mockReturnValue({ limit: limitMock });
      const sortMock = jest.fn().mockReturnValue({ skip: skipMock });

      Comment.find = jest.fn().mockReturnValue({ sort: sortMock });

      const req = { query: { page: '1', limit: '20' } };
      const res = mockRes();

      listCommentsForAdmin(req, res);
      await flush();

      expect(Comment.countDocuments).toHaveBeenCalledWith({});
      expect(res.status).toHaveBeenCalledWith(200);
      const payload = res.json.mock.calls[0][0];
      expect(payload.success).toBe(true);
      expect(payload.data.comments).toHaveLength(1);
      expect(payload.data.comments[0].text).toBe('This book was amazing!');
      expect(payload.data.comments[0].target.title).toBe('The Great Story');
    });
  });

  describe('deleteCommentForAdmin', () => {
    test('successfully deletes comment and returns 200', async () => {
      Comment.findByIdAndDelete = jest.fn().mockResolvedValue({ _id: 'comment-1' });

      const req = { params: { id: 'comment-1' } };
      const res = mockRes();

      deleteCommentForAdmin(req, res);
      await flush();

      expect(Comment.findByIdAndDelete).toHaveBeenCalledWith('comment-1');
      expect(res.status).toHaveBeenCalledWith(200);
      const payload = res.json.mock.calls[0][0];
      expect(payload.success).toBe(true);
      expect(payload.message).toBe('Comment removed successfully.');
    });

    test('returns 404 when comment does not exist', async () => {
      Comment.findByIdAndDelete = jest.fn().mockResolvedValue(null);

      const req = { params: { id: 'missing-comment' } };
      const res = mockRes();

      deleteCommentForAdmin(req, res);
      await flush();

      expect(Comment.findByIdAndDelete).toHaveBeenCalledWith('missing-comment');
      expect(res.status).toHaveBeenCalledWith(404);
      const payload = res.json.mock.calls[0][0];
      expect(payload.success).toBe(false);
      expect(payload.message).toBe('Comment not found.');
    });
  });
});
