const Content = require('../models/Content');
const asyncHandler = require('../utils/asyncHandler');
const { success, fail } = require('../utils/response');
const { generateChatSuggestion, OpenRouterConfigError } = require('../utils/openrouter');

const MAX_HISTORY_MESSAGES = 12; // keeps each request small/cheap
const CANDIDATE_POOL_SIZE = 30;

// @route POST /api/content/ai-chat
// @desc  Public - powers both the full AI Suggestions page and the
//        floating chat widget (same shared frontend component, see
//        AiChatPanel.jsx). Stateless: the frontend resends the whole
//        conversation each turn (see anthropic_api_in_artifacts-style
//        convention elsewhere in this codebase - no server-side session).
//        NOTE: this calls a paid OpenRouter model on every message with no
//        auth/rate-limit in front of it yet - fine for now, but worth
//        gating behind login or a rate limiter before real traffic if
//        API cost becomes a concern.
const chatWithAiSuggestions = asyncHandler(async (req, res) => {
  const rawMessages = Array.isArray(req.body.messages) ? req.body.messages.slice(-MAX_HISTORY_MESSAGES) : [];
  const messages = rawMessages
    .filter((message) => message && (message.role === 'user' || message.role === 'assistant') && typeof message.content === 'string')
    .map((message) => ({ role: message.role, content: message.content.trim() }))
    .filter((message) => message.content);

  if (!messages.length) {
    return fail(res, 400, 'messages must include at least one message with content.');
  }

  const latestUserMessage = [...messages].reverse().find((message) => message.role === 'user')?.content || '';

  const stopWords = new Set([
    'the', 'and', 'for', 'with', 'about', 'some', 'book', 'books', 'read', 'listen',
    'want', 'like', 'give', 'recommend', 'suggestion', 'suggestions', 'something',
    'please', 'tell', 'more', 'what', 'which', 'looking', 'tôi', 'muốn', 'sách',
    'đọc', 'nghe', 'cuốn', 'thích', 'cho', 'gợi', 'ý'
  ]);
  const keywords = latestUserMessage
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !stopWords.has(w))
    .slice(0, 8);

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

  if (!candidates.length) {
    return fail(res, 503, 'No published catalog content available to suggest from yet - try again once the daily sync has run.');
  }

  const candidateLookup = new Map(candidates.map((item) => [String(item._id), item]));
  const titleLookup = new Map(candidates.map((item) => [item.title.toLowerCase().trim(), item]));

  try {
    const { reply, suggestionIds, options } = await generateChatSuggestion({
      messages,
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

    for (const idOrTitle of (suggestionIds || [])) {
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
      id: String(item._id),
      title: item.title,
      author: item.author,
      type: item.type,
      cover_image: item.cover_image || '',
    }));

    return success(res, 200, 'AI reply generated.', { reply, suggestions, options: options || [] });
  } catch (error) {
    if (error instanceof OpenRouterConfigError) {
      return fail(res, 503, error.message);
    }
    return fail(res, 502, `AI request failed: ${error.message}`);
  }
});

module.exports = { chatWithAiSuggestions };
