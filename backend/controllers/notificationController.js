const Notification = require('../models/Notification');
const asyncHandler = require('../utils/asyncHandler');
const { success, fail } = require('../utils/response');

// Matches the { id, ... } shape the frontend already expects from other
// endpoints (see sanitizeUser in userController.js), and folds the
// per-user readBy array down to a simple boolean for the current viewer.
function sanitizeNotification(notification, viewerId) {
  const isRead = viewerId
    ? notification.readBy.some((id) => String(id) === String(viewerId))
    : false;

  return {
    id: notification._id,
    title: notification.title,
    message: notification.message,
    audience: notification.audience,
    targetUser: notification.targetUser || null,
    bookId: notification.book || null,
    read: isRead,
    createdAt: notification.createdAt,
  };
}

// @route POST /api/notifications
// @desc  Admin broadcasts a notification to all customers.
const createNotification = asyncHandler(async (req, res) => {
  const { title, message, targetUserId } = req.body;

  if (!title || !message) {
    return fail(res, 400, 'Title and message are required.');
  }

  const notification = await Notification.create({
    title,
    message,
    createdBy: req.user._id,
    audience: targetUserId ? 'single-customer' : 'all-customers',
    targetUser: targetUserId || null,
  });

  return success(res, 201, 'Notification sent successfully.', {
    notification: sanitizeNotification(notification, req.user._id),
  });
});

// @route GET /api/notifications
// @desc  Returns the notification dropdown contents.
//        - Customer/staff: their notifications, with an unread count.
//        - Anonymous: same shape, but with a "must log in" message and no data.
const getNotifications = asyncHandler(async (req, res) => {
  if (!req.user) {
    return success(res, 200, 'You must log in to view notifications.', {
      notifications: [],
      unreadCount: 0,
      requiresLogin: true,
    });
  }

  const notifications = await Notification.find({
    $or: [
      // Broadcasts only count for customers whose account already existed
      // when the notification went out - a freshly created account
      // shouldn't see a backlog of "new book" announcements from before
      // they signed up.
      { audience: 'all-customers', createdAt: { $gte: req.user.createdAt } },
      { targetUser: req.user._id },
    ],
  })
    .sort({ createdAt: -1 })
    .limit(50);

  const unreadCount = notifications.filter(
    (n) => !n.readBy.some((id) => String(id) === String(req.user._id))
  ).length;

  return success(res, 200, 'Notifications retrieved successfully.', {
    notifications: notifications.map((n) => sanitizeNotification(n, req.user._id)),
    unreadCount,
    requiresLogin: false,
  });
});

// @route PATCH /api/notifications/:id/read
const markAsRead = asyncHandler(async (req, res) => {
  const notification = await Notification.findById(req.params.id);

  if (!notification) {
    return fail(res, 404, 'Notification not found.');
  }

  const alreadyRead = notification.readBy.some((id) => String(id) === String(req.user._id));
  if (!alreadyRead) {
    notification.readBy.push(req.user._id);
    await notification.save();
  }

  return success(res, 200, 'Notification marked as read.', {
    notification: sanitizeNotification(notification, req.user._id),
  });
});

// @route PATCH /api/notifications/read-all
// @desc  Marks every notification currently visible to this user as read,
//        in one round trip instead of one PATCH per item.
const markAllAsRead = asyncHandler(async (req, res) => {
  await Notification.updateMany(
    {
      $or: [
        { audience: 'all-customers', createdAt: { $gte: req.user.createdAt } },
        { targetUser: req.user._id },
      ],
      readBy: { $ne: req.user._id },
    },
    { $addToSet: { readBy: req.user._id } },
  );

  return success(res, 200, 'All notifications marked as read.', {});
});

module.exports = { createNotification, getNotifications, markAsRead, markAllAsRead };
