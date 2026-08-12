// Moved for security: this file used to hardcode a MongoDB connection string
// directly in client-side code (everything in src/ is bundled and shipped to
// the browser - anyone could open DevTools and read your database password).
//
// The real MongoDB connection now lives in `backend/db.js` and only runs on
// the Node server (`npm run server`), reading the URI from `backend/.env`,
// which is not committed to git.
//
// If your MongoDB password was ever committed to a public or shared repo,
// rotate it now: MongoDB Atlas -> Database Access -> Edit user -> Edit password.
export {}
