const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const mongoose = require('mongoose');

const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const bookRoutes = require('./routes/bookRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const bookMetadataRoutes = require('./routes/bookMetadataRoutes');
const contentRoutes = require('./routes/contentRoutes');
const contentAdminRoutes = require('./routes/contentAdminRoutes');
const librivoxRoutes = require('./routes/librivoxRoutes');
const aiSuggestionsRoutes = require('./routes/aiSuggestionsRoutes');
const supportRoutes = require('./routes/supportRoutes');
const adminSupportRoutes = require('./routes/adminSupportRoutes');
const adminCommentRoutes = require('./routes/adminCommentRoutes');
const cronRoutes = require('./routes/cronRoutes');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const { success } = require('./utils/response');

const app = express();

// In production, set FRONTEND_URL to your deployed frontend origin(s)
// (supports comma-separated URLs or wildcard '*').
// Automatically permits all *.vercel.app preview and production domains,
// plus localhost for local development.
const rawFrontendUrls = process.env.FRONTEND_URL || '';
const allowedOrigins = rawFrontendUrls
  .split(',')
  .map((o) => o.trim().replace(/\/+$/, ''))
  .filter(Boolean);

const corsOptions = {
  origin: (origin, callback) => {
    // Requests with no origin (curl, mobile apps, server-to-server)
    if (!origin) return callback(null, true);

    // If FRONTEND_URL is explicitly wildcard '*' or left unset, allow all
    if (allowedOrigins.length === 0 || allowedOrigins.includes('*')) {
      return callback(null, true);
    }

    // Direct match with any configured origin
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    // Allow all *.vercel.app deployments (e.g. preview branches like book-worm-v2-stcm.vercel.app, book-worm-v2.vercel.app)
    if (/^https:\/\/([a-zA-Z0-9_-]+\.)?vercel\.app$/.test(origin)) {
      return callback(null, true);
    }

    // Allow localhost and local IP development
    if (/^https?:\/\/localhost(:\d+)?$/.test(origin) || /^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(origin)) {
      return callback(null, true);
    }

    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin',
    'X-CSRF-Token',
    'Accept-Version',
    'Content-Length',
    'Content-MD5',
    'Date',
    'X-Api-Version',
  ],
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json());
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

app.get('/api/health', (req, res) => success(res, 200, 'BookWorm API is running.', { status: 'ok' }));

// Quick diagnostic for "is my deploy actually wired up right" - checks
// Mongoose's live connection state and which required env vars are present
// (never secret values - FRONTEND_URL is shown in full since it's just a
// public URL, not sensitive) without needing to dig through Vercel's log viewer.
app.get('/api/health/db', async (req, res) => {
  const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];

  // Book counts by status, straight from Mongo, bypassing any app-level
  // filtering/caching - use this to check whether "X books show as
  // Published in Admin but only Y show on the public site" is a real data
  // mismatch or just a frontend display issue.
  let bookCounts = null;
  let duplicateTitles = [];
  let uniqueTitleIndexActive = false;
  try {
    if (mongoose.connection.readyState === 1) {
      const Book = require('./models/Book');
      const [total, published, draft, hidden] = await Promise.all([
        Book.countDocuments({}),
        Book.countDocuments({ status: 'published' }),
        Book.countDocuments({ status: 'draft' }),
        Book.countDocuments({ status: 'hidden' }),
      ]);
      bookCounts = { total, published, draft, hidden };

      // Groups by the same case/whitespace-insensitive key the app uses for
      // duplicate detection, so you can see directly whether leftover
      // duplicate-titled books are still sitting in the database (run
      // `npm run dedupe-books` in backend/ to clear these out).
      duplicateTitles = await Book.aggregate([
        { $group: { _id: '$normalizedTitle', count: { $sum: 1 }, titles: { $push: '$title' } } },
        { $match: { count: { $gt: 1 } } },
        { $project: { _id: 0, title: { $arrayElemAt: ['$titles', 0] }, count: 1 } },
      ]);

      // Confirms the unique index that actually prevents duplicate pushes
      // has finished building - if this is false, duplicate titles can
      // still slip through no matter what the frontend does, usually
      // because duplicateTitles above wasn't empty the last time the server
      // started (Mongo refuses to build a unique index over data that
      // already violates it).
      const indexes = await Book.collection.indexes();
      uniqueTitleIndexActive = indexes.some((idx) => idx.key && idx.key.normalizedTitle === 1 && idx.unique);
    }
  } catch (error) {
    bookCounts = { error: error.message };
  }

  return success(res, 200, 'Database diagnostic.', {
    mongoose: states[mongoose.connection.readyState] || 'unknown',
    frontendUrlConfigured: allowedFrontendOrigin || '(not set - CORS is open to all origins)',
    envPresent: {
      MONGODB_URI: Boolean(process.env.MONGODB_URI),
      FIREBASE_SERVICE_ACCOUNT_JSON: Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON),
      FIREBASE_SERVICE_ACCOUNT_PATH: Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_PATH),
    },
    bookCounts,
    duplicateTitles,
    uniqueTitleIndexActive,
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/books', bookRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/book-metadata', bookMetadataRoutes);
// GET /api/content - unified ebook+audiobook reads, see contentRoutes.js
app.use('/api/content', contentRoutes);
// Admin-only: Book Management list/detail/publish-hide/stats, see contentAdminRoutes.js
app.use('/api/admin/content', contentAdminRoutes);
// GET /api/librivox/preview - live, uncached LibriVox passthrough, see librivoxRoutes.js
app.use('/api/librivox', librivoxRoutes);
// Private per-user AI Suggestions chat history, see aiSuggestionsRoutes.js
app.use('/api/ai-suggestions', aiSuggestionsRoutes);
// Help chat widget (visitor side), see supportRoutes.js
app.use('/api/support', supportRoutes);
// Help chat inbox (admin side), see adminSupportRoutes.js
app.use('/api/admin/support', adminSupportRoutes);
// Comments moderation (admin side), see adminCommentRoutes.js
app.use('/api/admin/comments', adminCommentRoutes);
// GET /api/cron/ingest-content - daily Vercel Cron target, see cronRoutes.js
app.use('/api/cron', cronRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
