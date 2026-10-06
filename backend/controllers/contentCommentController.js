const mongoose = require('mongoose');
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
  let targetId = null;
  if (mongoose.Types.ObjectId.isValid(req.params.id)) {
    targetId = req.params.id;
  } else {
    const c = await Content.findOne({ externalId: String(req.params.id) }).select('_id');
    if (c) {
      targetId = c._id;
    } else {
      const num = Number(req.params.id);
      if (Number.isInteger(num) && num > 0) {
        const b = await Book.findOne({ sourceEtextNumber: num }).select('_id');
        if (b) targetId = b._id;
      }
    }
  }

  if (!targetId) {
    return success(res, 200, 'Comments retrieved successfully.', { comments: [] });
  }

  const comments = await Comment.find({
    $or: [{ content: targetId }, { book: targetId }],
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

  const isObjId = mongoose.Types.ObjectId.isValid(req.params.id);
  let target = null;
  let isBook = false;

  if (isObjId) {
    target = await Content.findOne({ _id: req.params.id, status: 'published' }).select('_id');
    if (!target) {
      target = await Book.findOne({ _id: req.params.id, status: 'published' }).select('_id');
      if (target) isBook = true;
    }
  } else {
    target = await Content.findOne({ externalId: String(req.params.id), status: 'published' }).select('_id');
    if (!target) {
      const num = Number(req.params.id);
      if (Number.isInteger(num) && num > 0) {
        target = await Book.findOne({ sourceEtextNumber: num, status: 'published' }).select('_id');
        if (target) isBook = true;
      }
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
