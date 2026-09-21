const express = require('express');
const { protect, authorize } = require('../middleware/auth');
const { listContentForAdmin, getContentDetail, updateContentStatus, getContentStats } = require('../controllers/contentAdminController');

const router = express.Router();

// Same staff roles bookRoutes.js already uses for catalog management.
router.use(protect, authorize('admin', 'manager', 'employee'));

router.get('/stats', getContentStats);
router.get('/', listContentForAdmin);
router.get('/:id', getContentDetail);
router.patch('/:id/status', updateContentStatus);

module.exports = router;
