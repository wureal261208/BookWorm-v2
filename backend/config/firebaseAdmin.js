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
    console.error(
      'Firebase Admin credentials are missing. Set FIREBASE_SERVICE_ACCOUNT_JSON or ' +
        'FIREBASE_SERVICE_ACCOUNT_PATH in your .env (see README for how to generate one).'
    );
    process.exit(1);
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  return admin;
}

module.exports = initFirebaseAdmin;
