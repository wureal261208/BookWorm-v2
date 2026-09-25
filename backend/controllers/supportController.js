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

  // Only ever returns what THIS call added beyond the visitor's own
  // message (an AI reply, an escalation notice, or nothing while waiting
  // on an admin) - never the full conversation. The widget itself never
  // loads history (see HelpChatWidget.jsx - reset on every open, per Wun's
  // call), so handing back the whole growing server-side array would be
  // both wasted bytes and something the frontend would have to carefully
  // avoid re-displaying; a plain delta sidesteps that entirely.
  if (conversation.status === 'escalated') {
    // A human has this one now - the bot stays quiet so it doesn't talk
    // over the admin. Just save the visitor's message for the admin to see.
    await conversation.save();
    return success(res, 200, 'Message sent.', { status: conversation.status, newMessages: [] });
  }

  const userMessageCount = conversation.messages.filter((message) => message.role === 'user').length;

  if (userMessageCount >= ESCALATION_THRESHOLD) {
    const systemMessage = { role: 'system', text: "You're now connected with our support team - an admin will reply here soon." };
    conversation.status = 'escalated';
    conversation.messages.push(systemMessage);
    await conversation.save();
    return success(res, 200, 'Escalated to an admin.', { status: conversation.status, newMessages: [systemMessage] });
  }

  let assistantMessage;
  try {
    const history = conversation.messages
      .slice(-MAX_HISTORY_MESSAGES)
      .filter((message) => message.role === 'user' || message.role === 'assistant')
      .map((message) => ({ role: message.role, content: message.text }));
    const reply = await generateHelpReply({ messages: history });
    assistantMessage = { role: 'assistant', text: reply };
    conversation.messages.push(assistantMessage);
  } catch (error) {
    // Don't lose the visitor's message just because the AI call failed -
    // save what we have and surface the error so the frontend can show a
    // retry state, same as any other AI-backed feature in this app.
    await conversation.save();
    if (error instanceof OpenRouterConfigError) return fail(res, 503, error.message);
    return fail(res, 502, `AI request failed: ${error.message}`);
  }

  await conversation.save();
  return success(res, 200, 'Message sent.', { status: conversation.status, newMessages: [assistantMessage] });
});

// @route POST /api/support/guest-chat
// @desc  Public, stateless, no persistence at all - for a visitor with no
//        account. Nothing to escalate to an admin here (there's no account
//        to notify), so this is AI-only, single-turn-in/single-turn-out,
//        with the caller resending the growing message list each time
//        (same shape as generateHelpReply expects) purely to keep context
//        within one open widget session - nothing is written to Mongo.
const guestChat = asyncHandler(async (req, res) => {
  const rawMessages = Array.isArray(req.body.messages) ? req.body.messages.slice(-MAX_HISTORY_MESSAGES) : [];
  const messages = rawMessages
    .filter((message) => message && (message.role === 'user' || message.role === 'assistant') && typeof message.content === 'string')
    .map((message) => ({ role: message.role, content: message.content.trim() }))
    .filter((message) => message.content);

  if (!messages.length) {
    return fail(res, 400, 'messages must include at least one message with content.');
  }

  try {
    const reply = await generateHelpReply({ messages });
    return success(res, 200, 'Reply generated.', { reply });
  } catch (error) {
    if (error instanceof OpenRouterConfigError) return fail(res, 503, error.message);
    return fail(res, 502, `AI request failed: ${error.message}`);
  }
});

module.exports = { getCurrentConversation, sendMessage, guestChat };
