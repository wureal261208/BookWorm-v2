const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

function loadServiceAccount() {
  // Preferred: paste the full service account JSON (from Firebase Console ->
  // Project settings -> Service accounts -> Generate new private key) into
  // this single environment variable.
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  }

  // Alternative: point to the downloaded JSON file's path on disk.
  // Resolved against process.cwd() (the folder you ran `npm run dev` from,
  // i.e. backend/) rather than this file's own folder (config/) - a plain
  // require(path) here would look inside config/ instead, which is the bug
  // behind "Cannot find module './firebase-service-account.json'".
  if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
    const resolvedPath = path.resolve(process.cwd(), process.env.FIREBASE_SERVICE_ACCOUNT_PATH);

    if (!fs.existsSync(resolvedPath)) {
      console.error(`FIREBASE_SERVICE_ACCOUNT_PATH points to a file that doesn't exist: ${resolvedPath}`);
      return null;
    }

    return JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
  }

  return null;
}

function initFirebaseAdmin() {
  if (admin.apps.length) {
    return admin;
  }

  const serviceAccount = loadServiceAccount();

  if (!serviceAccount) {
    // NOTE: this used to be process.exit(1). That's fine for a local
    // `npm run dev` process, but on Vercel this function runs inside a
    // shared serverless runtime - killing the process here doesn't just
    // fail the current request, it takes down the whole warm instance,
    // which is what showed up as "BACKEND_BOOT_FAILURE" / every route
    // 500ing at once. Throwing instead lets api/index.js's existing
    // try/catch turn this into a normal per-request 500 and keeps the
    // instance alive for the next request.
    throw new Error(
      'Firebase Admin credentials are missing. Set FIREBASE_SERVICE_ACCOUNT_JSON or ' +
        'FIREBASE_SERVICE_ACCOUNT_PATH in your .env (or Vercel project env vars).'
    );
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  return admin;
}

module.exports = initFirebaseAdmin;
