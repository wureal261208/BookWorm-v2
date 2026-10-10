const Story = require('../models/Story');
const Notification = require('../models/Notification');
const asyncHandler = require('../utils/asyncHandler');
const { success, fail } = require('../utils/response');

// @route GET /api/admin/stories
// @desc  Admin list all stories for moderation
const listStoriesForAdmin = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const skip = (page - 1) * limit;

  const query = {};

  if (req.query.status && ['published', 'hidden'].includes(req.query.status)) {
    query.status = req.query.status;
  }

  if (req.query.type && ['story', 'audio-story'].includes(req.query.type)) {
    query.type = req.query.type;
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
      .populate('author', 'name email avatar role displayId'),
  ]);

  const formatted = stories.map((s) => ({
    ...s.toObject(),
    id: s._id,
    likesCount: Array.isArray(s.likes) ? s.likes.length : 0,
  }));

  return success(res, 200, 'Admin stories retrieved successfully.', {
    stories: formatted,
    total,
    page,
    pages: Math.ceil(total / limit),
  });
});

// @route DELETE /api/admin/stories/:id
// @desc  Admin deletes a story and notifies author with deletion reason
const deleteStoryByAdmin = asyncHandler(async (req, res) => {
  const { reason } = req.body || {};
  const story = await Story.findById(req.params.id);

  if (!story) {
    return fail(res, 404, 'Story not found.');
  }

  const deletionReason = (reason && reason.trim()) || 'Content violates community guidelines.';

  // Dispatch an automated in-app notification to the story author
  if (story.author) {
    try {
      await Notification.create({
        title: 'Story Removed by Moderation',
        message: `Your story "${story.title}" was removed by moderation. Reason: ${deletionReason}`,
        createdBy: req.user._id,
        audience: 'single-customer',
        targetUser: story.author,
      });
    } catch (notifErr) {
      console.warn('Failed to dispatch moderation notification to author:', notifErr.message);
    }
  }

  // Delete the story from database
  await Story.findByIdAndDelete(req.params.id);

  return success(res, 200, 'Story removed and author notified successfully.', {
    removedStoryId: req.params.id,
    authorNotified: Boolean(story.author),
  });
});

module.exports = {
  listStoriesForAdmin,
  deleteStoryByAdmin,
};
