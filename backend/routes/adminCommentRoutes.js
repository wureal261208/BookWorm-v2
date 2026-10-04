const express = require('express');
const { protect, authorize } = require('../middleware/auth');
const { listCommentsForAdmin, deleteCommentForAdmin } = require('../controllers/adminCommentController');

const router = express.Router();

// Staff roles that can access and moderate comments.
router.use(protect, authorize('admin', 'manager', 'employee'));

router.get('/', listCommentsForAdmin);
router.delete('/:id', deleteCommentForAdmin);

module.exports = router;
