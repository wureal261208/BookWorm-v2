const express = require('express');
const { getMe } = require('../controllers/authController');
const { protect } = require('../middleware/auth');

const router = express.Router();

// Firebase Auth handles register/login on the frontend. This just returns
// (and auto-provisions, on first call) the app-side profile + role.
router.get('/me', protect, getMe);

module.exports = router;
