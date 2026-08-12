const express = require('express');
const {
  createNotification,
  getNotifications,
  markAsRead,
} = require('../controllers/notificationController');
const { identify, protect, authorize } = require('../middleware/auth');

const router = express.Router();

// Anonymous, customer, and staff can all open the notification dropdown.
// The controller returns a "must log in" message for anonymous visitors.
router.get('/', identify, getNotifications);

// Only admin can broadcast notifications.
router.post('/', protect, authorize('admin'), createNotification);

router.patch('/:id/read', protect, markAsRead);

module.exports = router;
