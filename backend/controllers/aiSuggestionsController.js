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

  // Mapped to `id` (not the raw `_id`) - AiSuggestionsPage.jsx keys and
  // opens conversations by `.id` everywhere, including the ones it appends
  // to this same list locally right after creating one. Leaving this as
  // `_id` meant every conversation loaded from this endpoint (i.e. every
  // one from a past session) silently had no usable id to open by - clicks
  // did nothing, which is exactly the "history doesn't show anything" bug.
  return success(
    res,
    200,
    'Conversations fetched.',
    conversations.map((conversation) => ({ id: conversation._id, title: conversation.title, updatedAt: conversation.updatedAt })),
  );
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

// @route DELETE /api/ai-suggestions/conversations
const clearAllConversations = asyncHandler(async (req, res) => {
  const result = await Conversation.deleteMany({ user: req.user._id, kind: 'ai-suggestions' });
  return success(res, 200, 'All chat history deleted.', { deletedCount: result.deletedCount });
});

function extractKeywords(text) {
  if (!text) return [];
  const stopWords = new Set([
    'the', 'and', 'for', 'with', 'about', 'some', 'book', 'books', 'read', 'listen',
    'want', 'like', 'give', 'recommend', 'suggestion', 'suggestions', 'something',
    'please', 'tell', 'more', 'what', 'which', 'looking', 'tôi', 'muốn', 'sách',
    'đọc', 'nghe', 'cuốn', 'thích', 'cho', 'gợi', 'ý'
  ]);
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !stopWords.has(w))
    .slice(0, 8);
}

async function fetchCandidates(latestUserText) {
  const keywords = extractKeywords(latestUserText);

  let candidates = [];
  if (keywords.length) {
    const orClauses = keywords.flatMap((keyword) => {
      const safe = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return [
        { title: { $regex: safe, $options: 'i' } },
        { author: { $regex: safe, $options: 'i' } },
        { categories: { $regex: safe, $options: 'i' } },
      ];
    });

    candidates = await Content.find({ status: 'published', $or: orClauses })
      .sort({ downloadCount: -1 })
      .limit(CANDIDATE_POOL_SIZE)
      .select('title author type categories cover_image')
      .lean();
  }

  if (candidates.length < 8) {
    const seen = new Set(candidates.map((item) => String(item._id)));
    const topUp = await Content.find({ status: 'published' })
      .sort({ downloadCount: -1 })
      .limit(CANDIDATE_POOL_SIZE)
      .select('title author type categories cover_image')
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
  const titleLookup = new Map(candidates.map((item) => [item.title.toLowerCase().trim(), item]));

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

  // Smart matching: resolve by exact ID, title lookup, or fuzzy title match
  const matchedSuggestions = [];
  const addedIds = new Set();

  for (const idOrTitle of suggestionIds) {
    const rawStr = String(idOrTitle).trim();
    let item = candidateLookup.get(rawStr);
    if (!item) {
      item = titleLookup.get(rawStr.toLowerCase());
    }
    if (!item) {
      item = candidates.find((c) =>
        c.title.toLowerCase().includes(rawStr.toLowerCase()) ||
        rawStr.toLowerCase().includes(c.title.toLowerCase())
      );
    }
    if (item && !addedIds.has(String(item._id))) {
      addedIds.add(String(item._id));
      matchedSuggestions.push(item);
    }
  }

  // Fallback: If AI mentions candidate book titles in reply text and no suggestions were resolved
  if (matchedSuggestions.length === 0) {
    for (const item of candidates) {
      if (item.title && item.title.length > 3 && reply.toLowerCase().includes(item.title.toLowerCase())) {
        if (!addedIds.has(String(item._id))) {
          addedIds.add(String(item._id));
          matchedSuggestions.push(item);
          if (matchedSuggestions.length >= 4) break;
        }
      }
    }
  }

  const suggestions = matchedSuggestions.map((item) => ({
    id: item._id,
    title: item.title,
    author: item.author,
    type: item.type,
    cover_image: item.cover_image || '',
  }));

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
    await conversation.save();
  } catch (error) {
    if (error instanceof OpenRouterConfigError) return fail(res, 503, error.message);
    return fail(res, 502, `Could not save the conversation: ${error.message}`);
  }

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
    await conversation.save();
  } catch (error) {
    if (error instanceof OpenRouterConfigError) return fail(res, 503, error.message);
    return fail(res, 502, `Could not save the conversation: ${error.message}`);
  }

  return success(res, 200, 'Message sent.', conversation);
});

module.exports = { listConversations, getConversation, deleteConversation, clearAllConversations, createConversation, addMessage };
