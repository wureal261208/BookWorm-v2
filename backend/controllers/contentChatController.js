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

  // Bias the candidate pool toward whatever the reader just said (a loose
  // keyword match against categories) so the model has relevant options,
  // then top up with generally popular titles so it always has a
  // reasonable pool even when nothing matches.
  const keywords = latestUserMessage
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

  if (!candidates.length) {
    return fail(res, 503, 'No published catalog content available to suggest from yet - try again once the daily sync has run.');
  }

  const candidateLookup = new Map(candidates.map((item) => [String(item._id), item]));

  try {
    const { reply, suggestionIds } = await generateChatSuggestion({
      messages,
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
      .map((item) => ({ id: String(item._id), title: item.title, author: item.author, type: item.type }));

    return success(res, 200, 'AI reply generated.', { reply, suggestions });
  } catch (error) {
    if (error instanceof OpenRouterConfigError) {
      return fail(res, 503, error.message);
    }
    return fail(res, 502, `AI request failed: ${error.message}`);
  }
});

module.exports = { chatWithAiSuggestions };
