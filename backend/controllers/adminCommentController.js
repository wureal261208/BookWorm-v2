const Comment = require('../models/Comment');
const asyncHandler = require('../utils/asyncHandler');
const { success, fail } = require('../utils/response');
const maskEmail = require('../utils/maskEmail');
const escapeRegExp = require('../utils/escapeRegExp');

// @route GET /api/admin/comments
// @desc  Staff lists comments across all books/contents with search & filter.
const listCommentsForAdmin = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const skip = (page - 1) * limit;

  const { q, targetType } = req.query;
  const filter = {};

  if (q && q.trim()) {
    filter.text = { $regex: escapeRegExp(q.trim()), $options: 'i' };
  }

  if (targetType === 'book') {
    filter.book = { $ne: null };
  } else if (targetType === 'content') {
    filter.content = { $ne: null };
  }

  const [total, rawComments] = await Promise.all([
    Comment.countDocuments(filter),
    Comment.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('user', 'name email role isRestricted')
      .populate('book', 'title author coverImage')
      .populate('content', 'title author coverImage type'),
  ]);

  const comments = rawComments.map((c) => ({
    id: c._id,
    text: c.text,
    createdAt: c.createdAt,
    author: {
      id: c.user?._id || null,
      name: c.user?.name || 'Reader',
      role: c.user?.role || 'customer',
      email: c.user?.email || '',
      maskedEmail: c.user?.email ? maskEmail(c.user.email) : '',
      isRestricted: Boolean(c.user?.isRestricted),
    },
    target: c.book
      ? {
          type: 'book',
          id: c.book._id,
          title: c.book.title,
          author: c.book.author,
          coverImage: c.book.coverImage,
        }
      : c.content
      ? {
          type: 'content',
          id: c.content._id,
          title: c.content.title,
          author: c.content.author,
          contentType: c.content.type,
          coverImage: c.content.coverImage,
        }
      : null,
  }));

  return success(res, 200, 'Admin comments retrieved.', {
    comments,
    total,
    page,
    totalPages: Math.ceil(total / limit) || 1,
  });
});

// @route DELETE /api/admin/comments/:id
// @desc  Staff removes an inappropriate or spam comment.
const deleteCommentForAdmin = asyncHandler(async (req, res) => {
  const comment = await Comment.findByIdAndDelete(req.params.id);
  if (!comment) {
    return fail(res, 404, 'Comment not found.');
  }

  return success(res, 200, 'Comment removed successfully.');
});

module.exports = { listCommentsForAdmin, deleteCommentForAdmin };
