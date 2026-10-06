const asyncHandler = require('../utils/asyncHandler');
const { success, fail } = require('../utils/response');
const Comment = require('../models/Comment');
const Content = require('../models/Content');
const Book = require('../models/Book');
const maskEmail = require('../utils/maskEmail');

// Same shape as commentController.js's serializeComment, with `contentId`
// in place of `bookId` - kept as a separate function (not a shared import
// toggling on a flag) since the two are small and independent enough that
// sharing one would just mean an if/else in the middle of it.
function serializeComment(comment) {
  return {
    id: comment._id,
    contentId: comment.content || comment.book,
    text: comment.text,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
    author: {
      id: comment.user?._id || comment.user,
      name: comment.user?.name || 'Reader',
      role: comment.user?.role || 'customer',
      maskedEmail: comment.user?.email ? maskEmail(comment.user.email) : '',
    },
  };
}

// @route GET /api/content/:id/comments
// @desc  Public - anyone can read a content item's comments.
const listContentComments = asyncHandler(async (req, res) => {
  const comments = await Comment.find({
    $or: [{ content: req.params.id }, { book: req.params.id }],
  })
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

  let target = await Content.findOne({ _id: req.params.id, status: 'published' }).select('_id');
  let isBook = false;
  if (!target) {
    const book = await Book.findOne({ _id: req.params.id, status: 'published' }).select('_id');
    if (book) {
      target = book;
      isBook = true;
    }
  }

  if (!target) {
    return fail(res, 404, 'Content not found.');
  }

  const comment = await Comment.create({
    content: isBook ? null : target._id,
    book: isBook ? target._id : null,
    user: req.user._id,
    text,
  });
  await comment.populate('user', 'name role email');

  return success(res, 201, 'Comment posted.', { comment: serializeComment(comment) });
});

// @route PATCH /api/content/:id/comments/:commentId
// @desc  Comment author or admin can edit a comment.
const updateContentComment = asyncHandler(async (req, res) => {
  const text = (req.body.text || '').trim();
  if (!text) {
    return fail(res, 400, 'Comment text is required.');
  }

  const comment = await Comment.findById(req.params.commentId).populate('user', 'name role email');
  if (!comment) {
    return fail(res, 404, 'Comment not found.');
  }

  const isOwner = comment.user && comment.user._id.toString() === req.user._id.toString();
  const isAdmin = req.user.role === 'admin';
  if (!isOwner && !isAdmin) {
    return fail(res, 403, 'You do not have permission to edit this comment.');
  }

  comment.text = text;
  await comment.save();

  return success(res, 200, 'Comment updated.', { comment: serializeComment(comment) });
});

// @route DELETE /api/content/:id/comments/:commentId
// @desc  Comment author or admin can delete a comment.
const deleteContentComment = asyncHandler(async (req, res) => {
  const comment = await Comment.findById(req.params.commentId);
  if (!comment) {
    return fail(res, 404, 'Comment not found.');
  }

  const isOwner = comment.user && comment.user.toString() === req.user._id.toString();
  const isAdmin = req.user.role === 'admin';
  if (!isOwner && !isAdmin) {
    return fail(res, 403, 'You do not have permission to delete this comment.');
  }

  await Comment.findByIdAndDelete(req.params.commentId);

  return success(res, 200, 'Comment deleted successfully.');
});

module.exports = {
  listContentComments,
  createContentComment,
  updateContentComment,
  deleteContentComment,
};
