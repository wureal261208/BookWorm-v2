// Vercel serverless entry point. Locally you run `npm run dev` (server.js,
// a normal long-running Express server) - this file is only used when
// deployed to Vercel, where every request is a fresh (or reused-warm)
// function invocation instead of one long-running process.
require('dotenv').config();

const app = require('../app');
const connectDB = require('../config/db');
const seedAdmin = require('../utils/seedAdmin');

module.exports = async (req, res) => {
  try {
    await connectDB();
    await seedAdmin();
  } catch (error) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: false, message: 'Server failed to reach the database.', data: null }));
    return;
  }

  return app(req, res);
};
