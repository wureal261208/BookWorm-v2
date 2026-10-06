// Vercel serverless entry point. Locally you run `npm run dev` (server.js,
// a normal long-running Express server) - this file is only used when
// deployed to Vercel, where every request is a fresh (or reused-warm)
// function invocation instead of one long-running process.
require('dotenv').config({ override: true });

const app = require('../app');
const connectDB = require('../config/db');
const seedAdmin = require('../utils/seedAdmin');

module.exports = async (req, res) => {
  // Respond immediately to CORS preflight OPTIONS without blocking on DB connection
  if (req.method === 'OPTIONS') {
    return app(req, res);
  }

  try {
    await connectDB();
    await seedAdmin();
  } catch (error) {
    const origin = req.headers.origin || '*';
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Requested-With,Accept,Origin,X-CSRF-Token,Accept-Version,Content-Length,Content-MD5,Date,X-Api-Version');
    res.end(JSON.stringify({ success: false, message: 'Server failed to reach the database.', data: null }));
    return;
  }

  return app(req, res);
};
