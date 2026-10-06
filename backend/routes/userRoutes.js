const express = require('express');
const {
  listUsers,
  banCustomer,
  unbanCustomer,
  notifyPasswordChanged,
  getMyProgress,
  updateMyProgress,
  getMyFavorites,
  toggleFavorite,
} = require('../controllers/userController');
const { getMe, updateMyTheme, updateMyPreferences, recordCategoryEngagement } = require('../controllers/authController');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

router.use(protect);

// Alias for /api/auth/me, kept for frontend compatibility.
router.get('/me', getMe);
router.patch('/me/theme', updateMyTheme);
router.patch('/me/preferences', updateMyPreferences);
router.post('/me/engagement', recordCategoryEngagement);

// Per-user reading & listening progress in MongoDB
router.get('/me/progress', getMyProgress);
router.post('/me/progress', updateMyProgress);

// Per-user saved books (favorites) in MongoDB
router.get('/me/favorites', getMyFavorites);
router.post('/me/favorites/:bookId', toggleFavorite);

// Called after Firebase reauth + updatePassword already succeeded
// client-side - see components/pages/ProfilePage.jsx.
router.post('/me/password-changed', notifyPasswordChanged);

// Admin-only user directory (Contributions > Users) and customer
// ban/unban - manager/employee account management (one-time codes,
// staff creation, resign, delete) has been retired.
router.get('/', authorize('admin'), listUsers);
router.patch('/:id/ban', authorize('admin'), banCustomer);
router.patch('/:id/unban', authorize('admin'), unbanCustomer);

module.exports = router;
