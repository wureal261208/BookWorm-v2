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

const PORT = process.env.PORT || 5000;

async function start() {
  try {
    await connectDB();
  } catch (error) {
    process.exit(1);
  }

  await seedAdmin();

  app.listen(PORT, () => {
    console.log(`BookWorm API listening on port ${PORT}`);
  });
}

start();
