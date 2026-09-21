const express = require('express');
const { runContentIngestion } = require('../controllers/contentController');
const { fail } = require('../utils/response');

const router = express.Router();

// Vercel automatically attaches "Authorization: Bearer <CRON_SECRET>" to
// requests it fires from vercel.json's `crons` entry, as long as CRON_SECRET
// is set in the project's Vercel env vars - see
// https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs
// If CRON_SECRET isn't set yet, this stays open (handy for testing the URL
// by hand first) - set it in Vercel before relying on this daily, so a
// random visitor can't trigger a sync just by hitting the URL.
function verifyCronRequest(req, res, next) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return next();
  }
  if (req.headers.authorization !== `Bearer ${secret}`) {
    return fail(res, 401, 'Unauthorized.');
  }
  return next();
}

router.get('/ingest-content', verifyCronRequest, runContentIngestion);

module.exports = router;
