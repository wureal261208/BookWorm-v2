const express = require('express');
const {
  createStaffWithCode,
  generateOneTimeCode,
  listUsers,
  upsertStaffByEmail,
  searchUsers,
  deleteStaffAccount,
  banCustomer,
  unbanCustomer,
  resignStaff,
  notifyPasswordChanged,
} = require('../controllers/userController');
const { getMe } = require('../controllers/authController');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

// Public: redeem a one-time code to create a manager/employee account.
router.post('/register-with-code', createStaffWithCode);

router.use(protect);

// Alias for /api/auth/me, kept for frontend compatibility.
router.get('/me', getMe);

// Called after Firebase reauth + updatePassword already succeeded
// client-side - see components/pages/ProfilePage.jsx.
router.post('/me/password-changed', notifyPasswordChanged);

// Admin: manager + employee codes. Manager: employee codes only (enforced in controller).
router.post('/one-time-code', authorize('admin', 'manager'), generateOneTimeCode);

// Must come before GET-by-id-style routes below - none currently exist for
// this router, but /search and /upsert-by-email are non-numeric path
// segments that would otherwise never collide with a Mongo ObjectId anyway.
router.get('/search', authorize('admin', 'manager'), searchUsers);
router.patch('/upsert-by-email', authorize('admin', 'manager'), upsertStaffByEmail);

router.get('/', authorize('admin', 'manager'), listUsers);

// Admin + manager can ban/unban customer accounts.
router.patch('/:id/ban', authorize('admin', 'manager'), banCustomer);
router.patch('/:id/unban', authorize('admin', 'manager'), unbanCustomer);

// Admin resigns manager/employee. Manager resigns employee only (enforced in controller).
router.patch('/:id/resign', authorize('admin', 'manager'), resignStaff);

// Permanently removes a manager/employee account. Same admin/manager gating as resign.
router.delete('/:id', authorize('admin', 'manager'), deleteStaffAccount);

module.exports = router;
