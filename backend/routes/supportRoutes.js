const express = require('express');
const { protect } = require('../middleware/auth');
const { getCurrentConversation, sendMessage } = require('../controllers/supportController');

const router = express.Router();

// Requires login, same reasoning as aiSuggestionsRoutes.js - an admin
// needs to know who they're replying to, and a guest has no account for a
// conversation to belong to.
router.use(protect);

router.get('/conversations/current', getCurrentConversation);
router.post('/conversations/current/messages', sendMessage);

module.exports = router;
