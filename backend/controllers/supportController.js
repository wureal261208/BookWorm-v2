const Conversation = require('../models/Conversation');
const asyncHandler = require('../utils/asyncHandler');
const { success, fail } = require('../utils/response');
const { generateHelpReply, OpenRouterConfigError } = require('../utils/openrouter');

// After this many of the visitor's own messages in one still-open
// conversation, the AI stops answering and a human admin takes over (per
// Wun's call - default 4).
const ESCALATION_THRESHOLD = 4;
const MAX_HISTORY_MESSAGES = 12;

// @route GET /api/support/conversations/current
// @desc  The visitor's own open (not yet closed) support conversation, if
//        any. A closed one is never returned here - per Wun's call, once
//        an admin closes a conversation it goes blank for the visitor, and
//        their next message starts a brand new one rather than reopening
//        the old thread.
const getCurrentConversation = asyncHandler(async (req, res) => {
  const conversation = await Conversation.findOne({ user: req.user._id, kind: 'support', status: { $ne: 'closed' } })
    .sort({ updatedAt: -1 })
    .lean();

  return success(res, 200, 'Conversation fetched.', conversation || null);
});

// @route POST /api/support/conversations/current/messages
const sendMessage = asyncHandler(async (req, res) => {
  const text = (req.body.text || '').trim();
  if (!text) return fail(res, 400, 'text is required.');

  let conversation = await Conversation.findOne({ user: req.user._id, kind: 'support', status: { $ne: 'closed' } }).sort({ updatedAt: -1 });
  if (!conversation) {
    conversation = new Conversation({ user: req.user._id, kind: 'support', status: 'ai', messages: [] });
  }

  conversation.messages.push({ role: 'user', text });

  if (conversation.status === 'escalated') {
    // A human has this one now - the bot stays quiet so it doesn't talk
    // over the admin. Just save the visitor's message for the admin to see.
    await conversation.save();
    return success(res, 200, 'Message sent.', conversation);
  }

  const userMessageCount = conversation.messages.filter((message) => message.role === 'user').length;

  if (userMessageCount >= ESCALATION_THRESHOLD) {
    conversation.status = 'escalated';
    conversation.messages.push({
      role: 'system',
      text: "You're now connected with our support team - an admin will reply here soon.",
    });
    await conversation.save();
    return success(res, 200, 'Escalated to an admin.', conversation);
  }

  try {
    const history = conversation.messages
      .slice(-MAX_HISTORY_MESSAGES)
      .filter((message) => message.role === 'user' || message.role === 'assistant')
      .map((message) => ({ role: message.role, content: message.text }));
    const reply = await generateHelpReply({ messages: history });
    conversation.messages.push({ role: 'assistant', text: reply });
  } catch (error) {
    // Don't lose the visitor's message just because the AI call failed -
    // save what we have and surface the error so the frontend can show a
    // retry state, same as any other AI-backed feature in this app.
    await conversation.save();
    if (error instanceof OpenRouterConfigError) return fail(res, 503, error.message);
    return fail(res, 502, `AI request failed: ${error.message}`);
  }

  await conversation.save();
  return success(res, 200, 'Message sent.', conversation);
});

module.exports = { getCurrentConversation, sendMessage };
