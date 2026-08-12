require('dotenv').config();

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
