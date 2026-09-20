const Book = require('../models/Book');
const asyncHandler = require('../utils/asyncHandler');
const { success, fail } = require('../utils/response');
const { generateRecommendationReply } = require('../utils/openrouter');

const recommendForMe = asyncHandler(async (req, res) => {
  const preferences = req.user.preferences || {};
  const filter = { moderationStatus: 'approved' };
  if (preferences.formats?.length) filter.type = { $in: preferences.formats };
  if (preferences.languages?.length) filter.language = { $in: preferences.languages };
  if (preferences.categories?.length) filter.categories = { $in: preferences.categories.map((name) => new RegExp(name, 'i')) };
  const books = await Book.find(filter).sort({ createdAt: -1 }).limit(24);
  return success(res, 200, 'Recommendations retrieved from your preferences.', { books, preferences });
});

const askAi = asyncHandler(async (req, res) => {
  const question = String(req.body.question || '').trim();
  if (!question) return fail(res, 400, 'question is required.');
  // MongoDB is always queried first. Text search gives useful candidates for
  // natural language requests without exposing the database to raw AI queries.
  let books = await Book.find({ moderationStatus: 'approved', $text: { $search: question } }).limit(10);
  let fallback = false;
  if (!books.length) {
    fallback = true;
    const [gutenbergResponse, librivoxResponse] = await Promise.all([
      fetch(`https://gutendex.com/books/?search=${encodeURIComponent(question)}`),
      fetch(`https://librivox.org/api/feed/audiobooks/?title=${encodeURIComponent(question)}&format=json&limit=5`),
    ]);
    const gutenberg = gutenbergResponse.ok ? await gutenbergResponse.json() : { results: [] };
    const librivox = librivoxResponse.ok ? await librivoxResponse.json() : { books: [] };
    books = [
      ...gutenberg.results.slice(0, 5).map((item) => ({ type: 'ebook', title: item.title, author: item.authors?.map((author) => author.name).join(', ') || 'Unknown', description: item.summaries?.[0] || '', categories: item.subjects?.slice(0, 5) || [], language: item.languages?.[0] || 'en', cover_image: item.formats?.['image/jpeg'] || '', source: 'Gutenberg', files: [] })),
      ...librivox.books.slice(0, 5).map((item) => ({ type: 'audiobook', title: item.title, author: item.authors?.map((author) => `${author.first_name || ''} ${author.last_name || ''}`.trim()).join(', ') || 'Unknown', description: item.description || '', categories: [], language: item.language || 'en', cover_image: '', source: 'LibriVox', files: [] })),
    ];
  }
  const defaultAnswer = fallback ? 'Mình chưa tìm thấy sách phù hợp trong thư viện hiện có, nên đã tìm thêm từ Project Gutenberg và LibriVox.' : 'Mình tìm được các sách phù hợp nhất trong thư viện BookWorm.';
  let answer = defaultAnswer;
  try { answer = await generateRecommendationReply(question, books) || defaultAnswer; } catch (error) { console.warn(`AI recommendation unavailable: ${error.message}`); }
  return success(res, 200, answer, { answer, books, fallbackSource: fallback ? ['Gutenberg', 'LibriVox'] : null });
});

module.exports = { recommendForMe, askAi };
