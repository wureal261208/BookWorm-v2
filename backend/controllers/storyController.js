const Story = require('../models/Story');
const asyncHandler = require('../utils/asyncHandler');
const { success, fail } = require('../utils/response');
const sanitizeNickname = require('../utils/sanitizeNickname');

// Helper to format story output with dynamic like states
function formatStory(story, viewerId) {
  const obj = story.toObject ? story.toObject() : { ...story };
  const likesArr = Array.isArray(obj.likes) ? obj.likes : [];
  const isLiked = viewerId ? likesArr.some((id) => id.toString() === viewerId.toString()) : false;
  const rawComments = Array.isArray(obj.comments) ? obj.comments : [];
  const commentsArr = rawComments.map((c) => {
    const cObj = c.toObject ? c.toObject() : { ...c };
    return {
      ...cObj,
      id: cObj._id,
      authorName: sanitizeNickname(cObj.authorName, 'Reader'),
    };
  });
  return {
    ...obj,
    id: obj._id,
    authorName: sanitizeNickname(obj.authorName, 'Reader'),
    likesCount: likesArr.length,
    commentsCount: commentsArr.length,
    comments: commentsArr,
    isLiked,
  };
}

// @route GET /api/stories
// @desc  List public stories (stories & voice recordings)
const listStories = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 12));
  const skip = (page - 1) * limit;

  const query = { status: 'published' };

  if (req.query.type && ['story', 'audio-story'].includes(req.query.type)) {
    query.type = req.query.type;
  }

  if (req.query.tag) {
    query.tags = req.query.tag;
  }

  if (req.query.search && req.query.search.trim()) {
    const term = req.query.search.trim();
    query.$or = [
      { title: { $regex: term, $options: 'i' } },
      { content: { $regex: term, $options: 'i' } },
      { authorName: { $regex: term, $options: 'i' } },
    ];
  }

  const [total, stories] = await Promise.all([
    Story.countDocuments(query),
    Story.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('author', 'name email avatar'),
  ]);

  const viewerId = req.user ? req.user._id : null;
  const sanitizedStories = stories.map((s) => formatStory(s, viewerId));

  return success(res, 200, 'Stories retrieved successfully.', {
    stories: sanitizedStories,
    total,
    page,
    pages: Math.ceil(total / limit),
  });
});

// @route GET /api/stories/mine
// @desc  List authenticated user's own stories
const getMyStories = asyncHandler(async (req, res) => {
  const stories = await Story.find({ author: req.user._id })
    .sort({ createdAt: -1 })
    .populate('author', 'name email avatar');

  const sanitizedStories = stories.map((s) => formatStory(s, req.user._id));

  return success(res, 200, 'Your stories retrieved successfully.', {
    stories: sanitizedStories,
  });
});

// @route GET /api/stories/:id
// @desc  Get a single story by ID and increment views
const getStoryById = asyncHandler(async (req, res) => {
  const story = await Story.findById(req.params.id).populate('author', 'name email avatar');

  if (!story || (story.status !== 'published' && (!req.user || String(story.author._id) !== String(req.user._id)))) {
    return fail(res, 404, 'Story not found or not accessible.');
  }

  // Increment views
  story.views = (story.views || 0) + 1;
  await story.save();

  const viewerId = req.user ? req.user._id : null;
  return success(res, 200, 'Story details retrieved.', {
    story: formatStory(story, viewerId),
  });
});

// @route POST /api/stories
// @desc  Publish a story or audio recording immediately (customer push)
const createStory = asyncHandler(async (req, res) => {
  const { title, content, audioDuration, coverUrl, tags } = req.body;
  let audioUrl = req.body.audioUrl || '';

  if (!title || !title.trim()) {
    return fail(res, 400, 'Title is required.');
  }

  if (!content || !content.trim()) {
    return fail(res, 400, 'Story content is required.');
  }

  let finalCoverUrl = (coverUrl || '').trim();

  // If files were uploaded in this request
  if (req.files) {
    if (req.files.audio && req.files.audio[0]) {
      audioUrl = `/uploads/${req.files.audio[0].filename}`;
    }
    if (req.files.coverImage && req.files.coverImage[0]) {
      finalCoverUrl = `/uploads/${req.files.coverImage[0].filename}`;
    }
  } else if (req.file) {
    if (req.file.mimetype.startsWith('audio/')) {
      audioUrl = `/uploads/${req.file.filename}`;
    } else if (req.file.mimetype.startsWith('image/')) {
      finalCoverUrl = `/uploads/${req.file.filename}`;
    }
  }

  const isAudio = Boolean(audioUrl && audioUrl.trim());
  const type = isAudio ? 'audio-story' : (req.body.type === 'audio-story' ? 'audio-story' : 'story');

  // Process tags, ensure 'stories' is always present
  let normalizedTags = ['stories'];
  if (Array.isArray(tags)) {
    normalizedTags = Array.from(new Set([...normalizedTags, ...tags.map((t) => String(t).trim().toLowerCase()).filter(Boolean)]));
  } else if (typeof tags === 'string' && tags.trim()) {
    const parsed = tags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
    normalizedTags = Array.from(new Set([...normalizedTags, ...parsed]));
  }

  const authorNickname = sanitizeNickname(req.user.name || req.user.email, 'Reader');

  const story = await Story.create({
    title: title.trim(),
    content: content.trim(),
    author: req.user._id,
    authorName: authorNickname,
    authorAvatar: req.user.avatar || '',
    audioUrl: audioUrl.trim(),
    audioDuration: Number(audioDuration) || 0,
    coverUrl: finalCoverUrl,
    tags: normalizedTags,
    type,
    status: 'published',
  });

  return success(res, 201, 'Story published successfully.', {
    story: formatStory(story, req.user._id),
  });
});

// @route POST /api/stories/upload-image
// @desc  Upload an image file (book cover, story cover)
const uploadCoverImage = asyncHandler(async (req, res) => {
  if (!req.file) {
    return fail(res, 400, 'No image file provided.');
  }

  if (!req.file.mimetype.startsWith('image/')) {
    return fail(res, 400, 'Only image files (JPEG, PNG, WebP) are allowed.');
  }

  const imageUrl = `/uploads/${req.file.filename}`;
  return success(res, 200, 'Cover image uploaded successfully.', {
    imageUrl,
    url: imageUrl,
    filename: req.file.filename,
    size: req.file.size,
    mimetype: req.file.mimetype,
  });
});

// @route POST /api/stories/upload-audio
// @desc  Upload an audio file (e.g. recorded voice blob or audio file)
const uploadStoryAudio = asyncHandler(async (req, res) => {
  if (!req.file) {
    return fail(res, 400, 'No audio file provided.');
  }

  const audioUrl = `/uploads/${req.file.filename}`;
  return success(res, 200, 'Audio uploaded successfully.', {
    audioUrl,
    filename: req.file.filename,
    size: req.file.size,
    mimetype: req.file.mimetype,
  });
});

// @route POST /api/stories/:id/like
// @desc  Toggle like on a story
const toggleLikeStory = asyncHandler(async (req, res) => {
  const story = await Story.findById(req.params.id);

  if (!story || story.status !== 'published') {
    return fail(res, 404, 'Story not found.');
  }

  const userIdStr = req.user._id.toString();
  const index = story.likes.findIndex((id) => id.toString() === userIdStr);

  let isLiked = false;
  if (index > -1) {
    story.likes.splice(index, 1);
    isLiked = false;
  } else {
    story.likes.push(req.user._id);
    isLiked = true;
  }

  await story.save();

  return success(res, 200, isLiked ? 'Story liked.' : 'Story unliked.', {
    isLiked,
    likesCount: story.likes.length,
  });
});

// @route DELETE /api/stories/:id
// @desc  Delete own story
const deleteMyStory = asyncHandler(async (req, res) => {
  const story = await Story.findById(req.params.id);

  if (!story) {
    return fail(res, 404, 'Story not found.');
  }

  if (story.author.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
    return fail(res, 403, 'You are not authorized to delete this story.');
  }

  await Story.findByIdAndDelete(req.params.id);

  return success(res, 200, 'Story deleted successfully.');
});

// @route GET /api/stories/:id/comments
// @desc  Fetch comments for a story
const getStoryComments = asyncHandler(async (req, res) => {
  const story = await Story.findById(req.params.id);
  if (!story || story.status !== 'published') {
    return fail(res, 404, 'Story not found.');
  }

  const comments = (story.comments || []).map((c) => {
    const cObj = c.toObject ? c.toObject() : { ...c };
    return {
      id: cObj._id,
      _id: cObj._id,
      user: cObj.user,
      authorName: sanitizeNickname(cObj.authorName, 'Reader'),
      authorAvatar: cObj.authorAvatar || '',
      text: cObj.text,
      createdAt: cObj.createdAt,
      updatedAt: cObj.updatedAt,
    };
  });

  return success(res, 200, 'Story comments retrieved successfully.', {
    comments,
    total: comments.length,
  });
});

// @route POST /api/stories/:id/comments
// @desc  Add a comment to a story (persisted in MongoDB)
const addStoryComment = asyncHandler(async (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) {
    return fail(res, 400, 'Comment text is required.');
  }

  if (text.trim().length > 2000) {
    return fail(res, 400, 'Comment text cannot exceed 2000 characters.');
  }

  const story = await Story.findById(req.params.id);
  if (!story || story.status !== 'published') {
    return fail(res, 404, 'Story not found.');
  }

  const authorNickname = sanitizeNickname(req.user.name || req.user.email, 'Reader');

  const newComment = {
    user: req.user._id,
    authorName: authorNickname,
    authorAvatar: req.user.avatar || '',
    text: text.trim(),
  };

  story.comments.push(newComment);
  await story.save();

  const savedComment = story.comments[story.comments.length - 1];
  const formattedComment = {
    id: savedComment._id,
    _id: savedComment._id,
    user: savedComment.user,
    authorName: savedComment.authorName,
    authorAvatar: savedComment.authorAvatar,
    text: savedComment.text,
    createdAt: savedComment.createdAt,
    updatedAt: savedComment.updatedAt,
  };

  return success(res, 201, 'Comment added successfully.', {
    comment: formattedComment,
    commentsCount: story.comments.length,
  });
});

// @route DELETE /api/stories/:id/comments/:commentId
// @desc  Delete a comment from a story
const deleteStoryComment = asyncHandler(async (req, res) => {
  const story = await Story.findById(req.params.id);
  if (!story) {
    return fail(res, 404, 'Story not found.');
  }

  const comment = story.comments.id(req.params.commentId);
  if (!comment) {
    return fail(res, 404, 'Comment not found.');
  }

  const isCommentAuthor = comment.user.toString() === req.user._id.toString();
  const isStoryAuthor = story.author.toString() === req.user._id.toString();
  const isAdmin = req.user.role === 'admin';

  if (!isCommentAuthor && !isStoryAuthor && !isAdmin) {
    return fail(res, 403, 'You are not authorized to delete this comment.');
  }

  comment.deleteOne();
  await story.save();

  return success(res, 200, 'Comment deleted successfully.', {
    commentsCount: story.comments.length,
  });
});

module.exports = {
  listStories,
  getMyStories,
  getStoryById,
  createStory,
  uploadCoverImage,
  uploadStoryAudio,
  toggleLikeStory,
  deleteMyStory,
  getStoryComments,
  addStoryComment,
  deleteStoryComment,
};
