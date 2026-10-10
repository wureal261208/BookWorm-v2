const express = require('express');
const { protect, identify } = require('../middleware/auth');
const upload = require('../middleware/upload');
const {
  listStories,
  getMyStories,
  getStoryById,
  createStory,
  uploadStoryAudio,
  toggleLikeStory,
  deleteMyStory,
} = require('../controllers/storyController');

const router = express.Router();

router.get('/', identify, listStories);
router.get('/mine', protect, getMyStories);
router.post('/upload-audio', protect, upload.single('audio'), uploadStoryAudio);
router.post('/', protect, upload.single('audio'), createStory);
router.get('/:id', identify, getStoryById);
router.post('/:id/like', protect, toggleLikeStory);
router.delete('/:id', protect, deleteMyStory);

module.exports = router;
