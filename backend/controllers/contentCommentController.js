const asyncHandler = require('../utils/asyncHandler');
const { success, fail } = require('../utils/response');
const Comment = require('../models/Comment');
const Content = require('../models/Content');
const maskEmail = require('../utils/maskEmail');

// Same shape as commentController.js's serializeComment, with `contentId`
// in place of `bookId` - kept as a separate function (not a shared import
// toggling on a flag) since the two are small and independent enough that
// sharing one would just mean an if/else in the middle of it.
function serializeComment(comment) {
  return {
    id: comment._id,
    contentId: comment.content,
    text: comment.text,
    createdAt: comment.createdAt,
    author: {
      name: comment.user?.name || 'Reader',
      role: comment.user?.role || 'customer',
      maskedEmail: comment.user?.email ? maskEmail(comment.user.email) : '',
    },
  };
}

// @route GET /api/content/:id/comments
// @desc  Public - anyone can read a content item's comments.
const listContentComments = asyncHandler(async (req, res) => {
  const comments = await Comment.find({ content: req.params.id })
    .sort({ createdAt: -1 })
    .populate('user', 'name role email')
    .limit(200);

  return success(res, 200, 'Comments retrieved successfully.', {
    comments: comments.map(serializeComment),
  });
});

// @route POST /api/content/:id/comments
// @desc  Any logged-in visitor (customer or staff) can comment.
const createContentComment = asyncHandler(async (req, res) => {
  const text = (req.body.text || '').trim();
  if (!text) {
    return fail(res, 400, 'Comment text is required.');
  }

  const content = await Content.findOne({ _id: req.params.id, status: 'published' }).select('_id');
  if (!content) {
    return fail(res, 404, 'Content not found.');
  }

  const comment = await Comment.create({
    content: content._id,
    user: req.user._id,
    text,
  });
  await comment.populate('user', 'name role email');

  return success(res, 201, 'Comment posted.', { comment: serializeComment(comment) });
});

module.exports = { listContentComments, createContentComment };
