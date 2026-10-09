const express = require('express');
const { protect } = require('../middleware/auth');
const {
  listConversations,
  getConversation,
  deleteConversation,
  clearAllConversations,
  createConversation,
  addMessage,
} = require('../controllers/aiSuggestionsController');

const router = express.Router();

router.use(protect);

router.get('/conversations', listConversations);
router.post('/conversations', createConversation);
router.delete('/conversations', clearAllConversations);
router.get('/conversations/:id', getConversation);
router.post('/conversations/:id/messages', addMessage);
router.delete('/conversations/:id', deleteConversation);

module.exports = router;
