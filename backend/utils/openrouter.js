// Thin wrapper around OpenRouter's OpenAI-compatible chat completions
// endpoint (https://openrouter.ai/api/v1/chat/completions). No SDK
// dependency needed - it's a plain JSON POST, and Node 18+ (what this repo
// already targets) has fetch built in.
//
// Required env vars (see backend/.env.example):
//   OPENROUTER_API_KEY   - from https://openrouter.ai/settings/keys
//   OPENROUTER_MODEL     - optional, defaults to 'openai/gpt-4o-mini'.
//                          Browse current options/pricing at
//                          https://openrouter.ai/models and swap this if
//                          you'd rather use a free-tier model.
// Optional (OpenRouter uses these only for its own public leaderboards,
// not required for the API call to work):
//   OPENROUTER_SITE_URL, OPENROUTER_SITE_NAME

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

class OpenRouterConfigError extends Error {}

function buildHeaders(apiKey) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
    // Optional per OpenRouter docs - only used for their public app
    // rankings, harmless to omit but nice to set if configured.
    ...(process.env.OPENROUTER_SITE_URL ? { 'HTTP-Referer': process.env.OPENROUTER_SITE_URL } : {}),
    ...(process.env.OPENROUTER_SITE_NAME ? { 'X-Title': process.env.OPENROUTER_SITE_NAME } : {}),
  };
}

function requireApiKey() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new OpenRouterConfigError('OPENROUTER_API_KEY is not set in backend/.env - see backend/.env.example.');
  }
  return apiKey;
}

// Asks the model for a short catalog description plus up to 5 subject
// tags for one book, given whatever context is on file for it (title,
// author, category, existing subjects, and - when available - a real
// excerpt of the book's own text, which produces a far more accurate
// summary than title/author alone). Returns { description, subjects }.
// Never touches the database itself - the caller decides what to do with
// the suggestion (BookController hands it back to the admin to review).
async function generateBookMetadataSuggestion({ title, author, category, existingSubjects, existingDescription, textExcerpt }) {
  const apiKey = requireApiKey();
  const model = process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';

  const contextLines = [
    `Title: ${title}`,
    `Author: ${author}`,
    category ? `Category: ${category}` : null,
    existingSubjects?.length ? `Existing subject tags: ${existingSubjects.join(', ')}` : null,
    existingDescription ? `Existing description (may be empty or a placeholder): ${existingDescription}` : null,
  ].filter(Boolean).join('\n');

  const excerptBlock = textExcerpt
    ? `\n\nHere is an excerpt from the actual book text, for context:\n"""\n${textExcerpt}\n"""`
    : '\n\nNo excerpt of the book text is available - base your answer only on the title, author, and category above. Do not invent specific plot details you cannot know from that information alone.';

  const userPrompt = `${contextLines}${excerptBlock}\n\nWrite:\n1. A 2-3 sentence "description" suitable for a library catalog page - inviting but not spoiler-heavy.\n2. Up to 5 short "subjects" (genre/theme tags, e.g. "Adventure", "Victorian England", "Detective fiction").\n\nRespond with ONLY a JSON object, no markdown fences, no commentary: {"description": "...", "subjects": ["...", "..."]}`;

  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: buildHeaders(apiKey),
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content: 'You are a library cataloguer. You always reply with a single raw JSON object and nothing else.',
        },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.6,
    }),
  });

  if (!response.ok) {
    const bodyText = await response.text().catch(() => '');
    throw new Error(`OpenRouter request failed (${response.status}): ${bodyText.slice(0, 300) || response.statusText}`);
  }

  const payload = await response.json();
  const raw = payload.choices?.[0]?.message?.content;
  if (!raw) {
    throw new Error('OpenRouter returned no content.');
  }

  let parsed;
  try {
    // Models occasionally wrap JSON in ```json fences despite instructions
    // not to - strip those before parsing rather than failing outright.
    const cleaned = raw.trim().replace(/^```json\s*|^```\s*|```$/gi, '');
    parsed = JSON.parse(cleaned);
  } catch (error) {
    throw new Error(`Could not parse OpenRouter's response as JSON: ${error.message}`);
  }

  return {
    description: typeof parsed.description === 'string' ? parsed.description.trim() : '',
    subjects: Array.isArray(parsed.subjects) ? parsed.subjects.filter((item) => typeof item === 'string' && item.trim()).slice(0, 5) : [],
  };
}

// Powers the AI Suggestions chat (both the full page and the floating chat
// widget - see frontend/src/components/content/AiChatPanel.jsx). Unlike
// generateBookMetadataSuggestion above, this one is grounded in a real,
// caller-supplied slice of the Content catalog (`candidates`) and is
// instructed to recommend ONLY from that list - the point is to never
// invent a book that doesn't actually exist in BookWorm's own database,
// the same "no fake personalization" standard the rest of the app holds
// itself to (see HomePage.jsx's own comments on this).
//
// Returns { reply, suggestionIds }: `reply` is the conversational text to
// show the user, `suggestionIds` are Content _ids (as strings) pulled out
// of a trailing JSON block the model is instructed to emit - the caller
// looks those ids up against the same candidate list to build real,
// clickable suggestion cards.
async function generateChatSuggestion({ messages, candidates }) {
  const apiKey = requireApiKey();
  const model = process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';

  const catalogBlock = candidates
    .map((item) => {
      const tag = item.type === 'audiobook' ? 'Audiobook' : 'Ebook';
      const categories = item.categories?.length ? ` - ${item.categories.slice(0, 3).join(', ')}` : '';
      return `- id:${item.id} | [${tag}] "${item.title}" by ${item.author}${categories}`;
    })
    .join('\n');

  const systemPrompt = [
    "You are BookWorm's friendly reading assistant, chatting one-on-one with a reader.",
    'You may ONLY recommend titles from the CATALOG list below - never invent a book, author, or edition that is not in this list.',
    '',
    'Use progressive clarification rather than guessing from a vague first message:',
    '- If the reader\'s request is broad or ambiguous ("something good to read", "surprise me", a single genre with no other detail), ask ONE short, specific clarifying question before recommending anything - e.g. mood, length, ebook vs audiobook, a book/author they already liked. Do not recommend anything that turn.',
    '- If they answer or their request is already specific enough (a clear genre plus some detail, a named author/comparison, or they say something like "just pick for me"), go ahead and recommend.',
    '- Never ask more than one clarifying question in a row before giving at least some picks - two unanswered questions in a row would feel like an interrogation, not a chat.',
    '',
    'When you do recommend, suggest at least 3 titles, mixing ebooks and audiobooks when it fits the request, and tag each one inline exactly as [Ebook] or [Audiobook] the way the catalog shows it.',
    'Keep a warm, conversational tone with a short line on why each pick fits what the reader asked for - you are chatting, not writing a catalog entry.',
    '',
    'After your conversational reply, on its own new line, output exactly one JSON object listing the ids of every title you recommended in THIS reply, in this exact shape and nothing else after it: {"suggestions": ["id1", "id2", "id3"]}',
    'If you asked a clarifying question instead of recommending, output {"suggestions": []}.',
    '',
    'CATALOG:',
    catalogBlock,
  ].join('\n');

  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: buildHeaders(apiKey),
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const bodyText = await response.text().catch(() => '');
    throw new Error(`OpenRouter request failed (${response.status}): ${bodyText.slice(0, 300) || response.statusText}`);
  }

  const payload = await response.json();
  const raw = payload.choices?.[0]?.message?.content;
  if (!raw) {
    throw new Error('OpenRouter returned no content.');
  }

  // The JSON block is the LAST {...} in the message - everything before it
  // is the conversational reply. If parsing fails for any reason, fall
  // back to showing the full raw text with no suggestion cards, rather
  // than dropping the reply entirely.
  const jsonMatch = raw.match(/\{[\s\S]*\}\s*$/);
  if (!jsonMatch) {
    return { reply: raw.trim(), suggestionIds: [] };
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      reply: raw.slice(0, jsonMatch.index).trim(),
      suggestionIds: Array.isArray(parsed.suggestions) ? parsed.suggestions.filter((id) => typeof id === 'string') : [],
    };
  } catch (error) {
    return { reply: raw.trim(), suggestionIds: [] };
  }
}

// Powers the "Help" floating chat widget - a first-line support assistant,
// not the book-recommendation chat (see generateChatSuggestion above,
// which is what the AI Suggestions page uses). No catalog grounding here -
// this just answers general "how does BookWorm work" questions and is
// upfront when it doesn't know something, since the whole point of the
// escalation flow (see controllers/supportController.js) is that a human
// admin picks up anything it can't handle.
async function generateHelpReply({ messages }) {
  const apiKey = requireApiKey();
  const model = process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';

  const systemPrompt = [
    "You are BookWorm's first-line help assistant, answering inside a small support chat widget.",
    'BookWorm is a free reading site with ebooks (from Project Gutenberg) and audiobooks (from LibriVox), plus a Community area and an AI Suggestions book-recommendation chat elsewhere on the site.',
    'Answer briefly and plainly. If you are not confident about something specific to this reader\'s account or a bug they are describing, say so honestly rather than guessing - a human admin will follow up when the conversation is escalated, so it is fine to not have every answer.',
    'Do not recommend specific book titles here - that is a different chat elsewhere on the site.',
  ].join('\n');

  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: buildHeaders(apiKey),
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      temperature: 0.4,
    }),
  });

  if (!response.ok) {
    const bodyText = await response.text().catch(() => '');
    throw new Error(`OpenRouter request failed (${response.status}): ${bodyText.slice(0, 300) || response.statusText}`);
  }

  const payload = await response.json();
  const raw = payload.choices?.[0]?.message?.content;
  if (!raw) {
    throw new Error('OpenRouter returned no content.');
  }

  return raw.trim();
}

module.exports = { generateBookMetadataSuggestion, generateChatSuggestion, generateHelpReply, OpenRouterConfigError };
