const Conversation = require('../models/Conversation');
const Notification = require('../models/Notification');
const asyncHandler = require('../utils/asyncHandler');
const { success, fail } = require('../utils/response');

// @route GET /api/admin/support/conversations?status=escalated
// @desc  Defaults to just the ones actually waiting on a human - pass
//        ?status=all to see ai/closed ones too.
const listConversations = asyncHandler(async (req, res) => {
  const status = req.query.status || 'escalated';
  const filter = status === 'all' ? { kind: 'support' } : { kind: 'support', status };

  const conversations = await Conversation.find(filter)
    .sort({ updatedAt: -1 })
    .populate('user', 'name email displayId')
    .select('user status updatedAt createdAt messages')
    .lean();

  // Trim to a preview for the list view - the detail route below returns
  // the full message array when an admin actually opens one.
  return success(
    res,
    200,
    'Conversations fetched.',
    conversations.map((conversation) => ({
      id: conversation._id,
      user: conversation.user,
      status: conversation.status,
      updatedAt: conversation.updatedAt,
      lastMessage: conversation.messages[conversation.messages.length - 1] || null,
    })),
  );
});

// @route GET /api/admin/support/conversations/:id
const getConversation = asyncHandler(async (req, res) => {
  const conversation = await Conversation.findOne({ _id: req.params.id, kind: 'support' }).populate('user', 'name email displayId').lean();
  if (!conversation) return fail(res, 404, 'Conversation not found.');
  return success(res, 200, 'Conversation fetched.', conversation);
});

// @route POST /api/admin/support/conversations/:id/reply
const replyToConversation = asyncHandler(async (req, res) => {
  const text = (req.body.text || '').trim();
  if (!text) return fail(res, 400, 'text is required.');

  const conversation = await Conversation.findOne({ _id: req.params.id, kind: 'support' });
  if (!conversation) return fail(res, 404, 'Conversation not found.');

  conversation.messages.push({ role: 'admin', text });
  // Covers an admin jumping into a conversation the AI was still handling,
  // not just the usual escalated-then-replied path.
  if (conversation.status === 'ai') conversation.status = 'escalated';
  await conversation.save();

  // Same targeted-notification shape notificationController.js already
  // uses for a single customer, so it shows up in their existing
  // notification bell with no extra frontend work.
  await Notification.create({
    title: 'Support replied to your message',
    message: text.length > 140 ? `${text.slice(0, 140)}...` : text,
    createdBy: req.user._id,
    audience: 'single-customer',
    targetUser: conversation.user,
  });

  return success(res, 200, 'Reply sent.', conversation);
});

// @route POST /api/admin/support/conversations/:id/close
const closeConversation = asyncHandler(async (req, res) => {
  const conversation = await Conversation.findOneAndUpdate({ _id: req.params.id, kind: 'support' }, { status: 'closed' }, { new: true });
  if (!conversation) return fail(res, 404, 'Conversation not found.');
  return success(res, 200, 'Conversation closed.', conversation);
});

module.exports = { listConversations, getConversation, replyToConversation, closeConversation };
