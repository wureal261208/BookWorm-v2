const express = require('express');
const { protect, authorize } = require('../middleware/auth');
const {
  listStoriesForAdmin,
  deleteStoryByAdmin,
} = require('../controllers/adminStoryController');

const router = express.Router();

router.use(protect, authorize('admin', 'manager', 'employee'));

router.get('/', listStoriesForAdmin);
router.delete('/:id', deleteStoryByAdmin);

module.exports = router;
