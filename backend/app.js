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

const app = express();

// In production, set FRONTEND_URL to your deployed frontend's exact origin
// (e.g. https://bookworm.vercel.app) to lock CORS down. Left unset, it
// stays open (fine for local dev, and while the frontend URL isn't final).
// Trimmed and stripped of any trailing slash - a copy-paste extra space or
// "/" at the end would otherwise silently mismatch the browser's Origin
// header (which never has a trailing slash) and break every request.
const allowedFrontendOrigin = (process.env.FRONTEND_URL || '').trim().replace(/\/+$/, '');
app.use(cors(allowedFrontendOrigin ? { origin: allowedFrontendOrigin } : {}));
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
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/books', bookRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/book-metadata', bookMetadataRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
