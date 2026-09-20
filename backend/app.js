const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const mongoose = require('mongoose');

const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const bookRoutes = require('./routes/bookRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const bookMetadataRoutes = require('./routes/bookMetadataRoutes');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const { success } = require('./utils/response');
const path = require('path');
const { recommendForMe, askAi } = require('./controllers/recommendationController');
const { protect } = require('./middleware/auth');

const app = express();

// In production, set FRONTEND_URL to your deployed frontend's exact origin
// (e.g. https://bookworm.vercel.app) to lock CORS down. Left unset, it
// stays open (fine for local dev, and while the frontend URL isn't final).
// Trimmed and stripped of any trailing slash - a copy-paste extra space or
// "/" at the end would otherwise silently mismatch the browser's Origin
// header (which never has a trailing slash) and break every request.
const configuredOrigins = (process.env.FRONTEND_URLS || process.env.FRONTEND_URL || '')
  .split(',')
  .map((origin) => origin.trim().replace(/\/+$/, ''))
  .filter(Boolean);

function isAllowedOrigin(origin) {
  if (!origin) return true; // server-to-server, curl and same-origin calls
  return configuredOrigins.includes(origin) || /^https:\/\/book-worm-v2(?:-[a-z0-9]+)?\.vercel\.app$/i.test(origin);
}

app.use(cors({
  origin(origin, callback) {
    callback(null, isAllowedOrigin(origin));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 204,
}));
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
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
      const [total, approved, pending, rejected] = await Promise.all([
        Book.countDocuments({}),
        Book.countDocuments({ moderationStatus: 'approved' }),
        Book.countDocuments({ moderationStatus: 'pending' }),
        Book.countDocuments({ moderationStatus: 'rejected' }),
      ]);
      bookCounts = { total, approved, pending, rejected };

      // Groups by the same case/whitespace-insensitive key the app uses for
      // duplicate detection, so you can see directly whether leftover
      // duplicate-titled books are still sitting in the database (run
      // `npm run dedupe-books` in backend/ to clear these out).
      duplicateTitles = await Book.aggregate([
        { $group: { _id: { title: '$title', author: '$author' }, count: { $sum: 1 }, titles: { $push: '$title' } } },
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
      uniqueTitleIndexActive = indexes.some((idx) => idx.key && idx.key.source === 1 && idx.key.externalId === 1 && idx.unique);
    }
  } catch (error) {
    bookCounts = { error: error.message };
  }

  return success(res, 200, 'Database diagnostic.', {
    mongoose: states[mongoose.connection.readyState] || 'unknown',
    frontendUrlConfigured: configuredOrigins.join(', ') || '(Vercel BookWorm deployments are allowed)',
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
app.get('/api/recommendations/me', protect, recommendForMe);
app.post('/api/ai/query', protect, askAi);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
