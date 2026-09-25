const express = require('express');
const { protect } = require('../middleware/auth');
const { listConversations, getConversation, deleteConversation, createConversation, addMessage } = require('../controllers/aiSuggestionsController');

const router = express.Router();

// Every route here requires login - a saved chat history has to belong to
// someone. A guest gets a friendly "log in to chat" prompt on the frontend
// rather than a stateless anonymous fallback, so there's only ever one
// code path to keep correct (see AiSuggestionsPage.jsx).
router.use(protect);

router.get('/conversations', listConversations);
router.post('/conversations', createConversation);
router.get('/conversations/:id', getConversation);
router.post('/conversations/:id/messages', addMessage);
router.delete('/conversations/:id', deleteConversation);

module.exports = router;
