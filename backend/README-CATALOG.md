# BookWorm catalog API

The production book model is `models/Book.js`. It replaces the legacy schema and explicitly calls `mongoose.deleteModel('Book')` before defining the new model, preventing cached schemas in development. New records live in `catalog_books`, so old `books` data is not mixed into the new schema.

Core endpoints:

- `GET /api/books?q=&type=ebook|audiobook&language=&categories=` — approved public catalog and multi-field search.
- `POST /api/books` — staff create a catalog record; customer submissions become `pending`.
- `POST /api/books/upload` — multipart customer upload: `bookFile`, optional `coverImage`, plus title, author, type, categories, language. Files are served from `/uploads` (use cloud object storage in production).
- `GET /api/books/external/search?q=&source=Gutenberg|LibriVox` and `POST /api/books/external/import` — staff discovery/import.
- `PATCH /api/books/:id/review` — staff approve/reject user uploads.
- `GET /api/books/stats` — admin dashboard counts.
- `PATCH /api/users/me/preferences` and `GET /api/recommendations/me` — first-login preference flow and personalized catalog.
- `POST /api/ai/query` — searches MongoDB first, then Gutendex + LibriVox; if `OPENROUTER_API_KEY` is configured, the AI explains the candidate recommendations.

The frontend catalog UI is available at `/library` after starting Vite. Set `VITE_API_BASE_URL` to your backend, e.g. `http://localhost:5000`.
