const express = require('express');
const {
  createNotification,
  getNotifications,
  markAsRead,
  markAllAsRead,
  getBroadcastHistory,
  deleteNotification,
} = require('../controllers/notificationController');
const { identify, protect, authorize } = require('../middleware/auth');

const router = express.Router();

// Anonymous, customer, and staff can all open the notification dropdown.
// The controller returns a "must log in" message for anonymous visitors.
router.get('/', identify, getNotifications);

// Only admin can broadcast notifications and view broadcast history.
router.get('/broadcasts', protect, authorize('admin'), getBroadcastHistory);
router.post('/', protect, authorize('admin'), createNotification);
router.delete('/:id', protect, authorize('admin'), deleteNotification);

router.patch('/read-all', protect, markAllAsRead);
router.patch('/:id/read', protect, markAsRead);

module.exports = router;

