const express = require('express');
const { protect } = require('../middleware/auth');
const { getCurrentConversation, getConversationById, getPendingRating, rateConversation, sendMessage, guestChat } = require('../controllers/supportController');

const router = express.Router();

// Public - a guest gets a stateless, non-escalatable AI-only reply (no
// account to persist a conversation against or to notify later).
router.post('/guest-chat', guestChat);

// Everything else requires login - an admin needs to know who they're
// replying to, which only makes sense for an actual account.
router.use(protect);

router.get('/conversations/current', getCurrentConversation);
router.get('/conversations/pending-rating', getPendingRating);
router.post('/conversations/current/messages', sendMessage);
router.get('/conversations/:id', getConversationById);
router.post('/conversations/:id/rate', rateConversation);

module.exports = router;
