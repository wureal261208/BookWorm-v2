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
app.use(cors(process.env.FRONTEND_URL ? { origin: process.env.FRONTEND_URL } : {}));
app.use(express.json());
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

app.get('/api/health', (req, res) => success(res, 200, 'BookWorm API is running.', { status: 'ok' }));

// Quick diagnostic for "is my deploy actually wired up right" - checks
// Mongoose's live connection state and which required env vars are present
// (never their values) without needing to dig through Vercel's log viewer.
app.get('/api/health/db', (req, res) => {
  const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  return success(res, 200, 'Database diagnostic.', {
    mongoose: states[mongoose.connection.readyState] || 'unknown',
    envPresent: {
      MONGODB_URI: Boolean(process.env.MONGODB_URI),
      FIREBASE_SERVICE_ACCOUNT_JSON: Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON),
      FIREBASE_SERVICE_ACCOUNT_PATH: Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_PATH),
    },
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
