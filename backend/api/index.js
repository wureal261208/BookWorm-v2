// Vercel serverless entry point. Locally you run `npm run dev` (server.js,
// a normal long-running Express server) - this file is only used when
// deployed to Vercel, where every request is a fresh (or reused-warm)
// function invocation instead of one long-running process.
require('dotenv').config({ override: true });

const app = require('../app');
const connectDB = require('../config/db');
const seedAdmin = require('../utils/seedAdmin');
const { hasFirebaseAdminConfig } = require('../config/firebaseAdmin');

// These headers are deliberately written before database/Firebase setup. If
// an infrastructure dependency is unavailable, browsers receive the actual
// API error instead of reporting a misleading CORS failure.
function setCorsHeaders(req, res) {
  const origin = req.headers.origin;
  if (origin && (/^https:\/\/book-worm-v2(?:-[a-z0-9]+)?\.vercel\.app$/i.test(origin) || (process.env.FRONTEND_URLS || process.env.FRONTEND_URL || '').split(',').map((url) => url.trim()).includes(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }
}

module.exports = async (req, res) => {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  try {
    await connectDB();
    // Health/public catalog must not crash just because Firebase is not
    // configured yet. Seed only after a Firebase service account is present.
    if (hasFirebaseAdminConfig()) await seedAdmin();
  } catch (error) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: false, message: 'Server failed to reach the database.', data: null }));
    return;
  }

  return app(req, res);
};
