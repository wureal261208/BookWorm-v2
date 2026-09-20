// `override: true` makes the values in .env always win over anything
// already set in the shell's environment (e.g. a stray `$env:MONGODB_URI =
// ...` typed into a PowerShell window while debugging, which otherwise
// keeps silently taking priority over .env for the rest of that terminal
// session - very easy to end up with two terminals pointed at two
// different databases without any of the code being wrong).
require('dotenv').config({ override: true });

const app = require('./app');
const connectDB = require('./config/db');
const seedAdmin = require('./utils/seedAdmin');
const { hasFirebaseAdminConfig } = require('./config/firebaseAdmin');

const PORT = process.env.PORT || 5000;

async function start() {
  try {
    await connectDB();
  } catch (error) {
    process.exit(1);
  }

  // The public catalog can run with MongoDB alone. Authentication/admin
  // provisioning becomes available after Firebase credentials are added.
  if (hasFirebaseAdminConfig()) {
    await seedAdmin();
  } else {
    console.warn('Firebase Admin is not configured; starting catalog API without Firebase authentication.');
  }

  app.listen(PORT, () => {
    console.log(`BookWorm API listening on port ${PORT}`);
  });
}

start();
