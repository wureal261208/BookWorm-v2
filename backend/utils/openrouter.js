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

// Asks the model for a short catalog description plus up to 5 subject
// tags for one book, given whatever context is on file for it (title,
// author, category, existing subjects, and - when available - a real
// excerpt of the book's own text, which produces a far more accurate
// summary than title/author alone). Returns { description, subjects }.
// Never touches the database itself - the caller decides what to do with
// the suggestion (BookController hands it back to the admin to review).
async function generateBookMetadataSuggestion({ title, author, category, existingSubjects, existingDescription, textExcerpt }) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new OpenRouterConfigError('OPENROUTER_API_KEY is not set in backend/.env - see backend/.env.example.');
  }

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
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      // Optional per OpenRouter docs - only used for their public app
      // rankings, harmless to omit but nice to set if configured.
      ...(process.env.OPENROUTER_SITE_URL ? { 'HTTP-Referer': process.env.OPENROUTER_SITE_URL } : {}),
      ...(process.env.OPENROUTER_SITE_NAME ? { 'X-Title': process.env.OPENROUTER_SITE_NAME } : {}),
    },
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

module.exports = { generateBookMetadataSuggestion, OpenRouterConfigError };
