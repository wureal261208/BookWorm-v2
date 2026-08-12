const express = require('express');
const {
  createStaffWithCode,
  generateOneTimeCode,
  listUsers,
  restrictCustomer,
  resignStaff,
} = require('../controllers/userController');
const { getMe } = require('../controllers/authController');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

// Public: redeem a one-time code to create a manager/employee account.
router.post('/register-with-code', createStaffWithCode);

router.use(protect);

// Alias for /api/auth/me, kept for frontend compatibility.
router.get('/me', getMe);

// Admin: manager + employee codes. Manager: employee codes only (enforced in controller).
router.post('/one-time-code', authorize('admin', 'manager'), generateOneTimeCode);

router.get('/', authorize('admin', 'manager'), listUsers);

// Admin + manager can restrict customer accounts.
router.patch('/:id/restrict', authorize('admin', 'manager'), restrictCustomer);

// Admin resigns manager/employee. Manager resigns employee only (enforced in controller).
router.patch('/:id/resign', authorize('admin', 'manager'), resignStaff);

module.exports = router;
