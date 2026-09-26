const Conversation = require('../models/Conversation');
const Content = require('../models/Content');
const asyncHandler = require('../utils/asyncHandler');
const { success, fail } = require('../utils/response');
const { generateChatSuggestion, OpenRouterConfigError } = require('../utils/openrouter');

const CANDIDATE_POOL_SIZE = 30;
const MAX_HISTORY_MESSAGES = 12;
const TITLE_LENGTH = 48;

// Every handler below scopes its query by `user: req.user._id` - an
// 'ai-suggestions' conversation is only ever readable by the account that
// created it. There is no admin route anywhere that lists or opens these -
// unlike 'support' conversations, these never leave the user's own account
// (see controllers/supportController.js's escalation queue for the one
// conversation kind admins actually see).

// @route GET /api/ai-suggestions/conversations
const listConversations = asyncHandler(async (req, res) => {
  const conversations = await Conversation.find({ user: req.user._id, kind: 'ai-suggestions' })
    .sort({ updatedAt: -1 })
    .select('title updatedAt createdAt')
    .lean();

  return success(res, 200, 'Conversations fetched.', conversations);
});

// @route GET /api/ai-suggestions/conversations/:id
const getConversation = asyncHandler(async (req, res) => {
  const conversation = await Conversation.findOne({ _id: req.params.id, user: req.user._id, kind: 'ai-suggestions' }).lean();
  if (!conversation) return fail(res, 404, 'Conversation not found.');
  return success(res, 200, 'Conversation fetched.', conversation);
});

// @route DELETE /api/ai-suggestions/conversations/:id
const deleteConversation = asyncHandler(async (req, res) => {
  const result = await Conversation.deleteOne({ _id: req.params.id, user: req.user._id, kind: 'ai-suggestions' });
  if (!result.deletedCount) return fail(res, 404, 'Conversation not found.');
  return success(res, 200, 'Conversation deleted.', null);
});

async function fetchCandidates(latestUserText) {
  const keywords = latestUserText
    .split(/[^a-zA-Z]+/)
    .filter((word) => word.length > 3)
    .slice(0, 5);

  let candidates = [];
  if (keywords.length) {
    candidates = await Content.find({ status: 'published', categories: { $regex: keywords.join('|'), $options: 'i' } })
      .sort({ downloadCount: -1 })
      .limit(CANDIDATE_POOL_SIZE)
      .select('title author type categories')
      .lean();
  }

  if (candidates.length < 8) {
    const seen = new Set(candidates.map((item) => String(item._id)));
    const topUp = await Content.find({ status: 'published' })
      .sort({ downloadCount: -1 })
      .limit(CANDIDATE_POOL_SIZE)
      .select('title author type categories')
      .lean();
    for (const item of topUp) {
      if (candidates.length >= CANDIDATE_POOL_SIZE) break;
      if (!seen.has(String(item._id))) {
        candidates.push(item);
        seen.add(String(item._id));
      }
    }
  }

  return candidates;
}

async function askAndAppend(conversation, userText) {
  const candidates = await fetchCandidates(userText);
  if (!candidates.length) {
    throw new Error('No published catalog content available to suggest from yet.');
  }
  const candidateLookup = new Map(candidates.map((item) => [String(item._id), item]));

  const history = conversation.messages
    .slice(-MAX_HISTORY_MESSAGES)
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .map((message) => ({ role: message.role, content: message.text }));

  const { reply, suggestionIds, options } = await generateChatSuggestion({
    messages: history,
    candidates: candidates.map((item) => ({
      id: String(item._id),
      title: item.title,
      author: item.author,
      type: item.type,
      categories: item.categories,
    })),
  });

  const suggestions = suggestionIds
    .map((id) => candidateLookup.get(id))
    .filter(Boolean)
    .map((item) => ({ id: item._id, title: item.title, author: item.author, type: item.type }));

  conversation.messages.push({ role: 'assistant', text: reply, suggestions, options });
}

// @route POST /api/ai-suggestions/conversations
// @desc  Starts a brand new conversation with the given first message.
const createConversation = asyncHandler(async (req, res) => {
  const text = (req.body.text || '').trim();
  if (!text) return fail(res, 400, 'text is required.');

  const conversation = new Conversation({
    user: req.user._id,
    kind: 'ai-suggestions',
    title: text.slice(0, TITLE_LENGTH),
    messages: [{ role: 'user', text }],
  });

  try {
    await askAndAppend(conversation, text);
  } catch (error) {
    if (error instanceof OpenRouterConfigError) return fail(res, 503, error.message);
    return fail(res, 502, `AI request failed: ${error.message}`);
  }

  await conversation.save();
  return success(res, 201, 'Conversation started.', conversation);
});

// @route POST /api/ai-suggestions/conversations/:id/messages
const addMessage = asyncHandler(async (req, res) => {
  const text = (req.body.text || '').trim();
  if (!text) return fail(res, 400, 'text is required.');

  const conversation = await Conversation.findOne({ _id: req.params.id, user: req.user._id, kind: 'ai-suggestions' });
  if (!conversation) return fail(res, 404, 'Conversation not found.');

  conversation.messages.push({ role: 'user', text });

  try {
    await askAndAppend(conversation, text);
  } catch (error) {
    if (error instanceof OpenRouterConfigError) return fail(res, 503, error.message);
    return fail(res, 502, `AI request failed: ${error.message}`);
  }

  await conversation.save();
  return success(res, 200, 'Message sent.', conversation);
});

module.exports = { listConversations, getConversation, deleteConversation, createConversation, addMessage };
