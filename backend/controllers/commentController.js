const asyncHandler = require('../utils/asyncHandler');
const { success, fail } = require('../utils/response');
const Comment = require('../models/Comment');
const Book = require('../models/Book');
const maskEmail = require('../utils/maskEmail');

function serializeComment(comment) {
  return {
    id: comment._id,
    bookId: comment.book,
    text: comment.text,
    createdAt: comment.createdAt,
    author: {
      name: comment.user?.name || 'Reader',
      role: comment.user?.role || 'customer',
      // Never send a real email address down for comment display - only
      // ever the masked form, same convention as the rest of Admin.
      maskedEmail: comment.user?.email ? maskEmail(comment.user.email) : '',
    },
  };
}

// @route GET /api/books/:id/comments
// @desc  Public - anyone can read a book's comments.
const listComments = asyncHandler(async (req, res) => {
  const comments = await Comment.find({ book: req.params.id })
    .sort({ createdAt: -1 })
    .populate('user', 'name role email')
    .limit(200);

  return success(res, 200, 'Comments retrieved successfully.', {
    comments: comments.map(serializeComment),
  });
});

// @route POST /api/books/:id/comments
// @desc  Any logged-in visitor (customer or staff) can comment.
const createComment = asyncHandler(async (req, res) => {
  const text = (req.body.text || '').trim();
  if (!text) {
    return fail(res, 400, 'Comment text is required.');
  }

  const book = await Book.findById(req.params.id).select('_id');
  if (!book) {
    return fail(res, 404, 'Book not found.');
  }

  const comment = await Comment.create({
    book: book._id,
    user: req.user._id,
    text,
  });
  await comment.populate('user', 'name role email');

  return success(res, 201, 'Comment posted.', { comment: serializeComment(comment) });
});

module.exports = { listComments, createComment };
