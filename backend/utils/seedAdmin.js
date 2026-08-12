const initFirebaseAdmin = require('../config/firebaseAdmin');
const User = require('../models/User');

let seeded = global._adminSeeded || false;

async function seedAdmin() {
  if (seeded) {
    return;
  }

  const existingAdmin = await User.findOne({ role: 'admin' });

  if (existingAdmin) {
    console.log('Default admin already exists. Skipping seed.');
    seeded = global._adminSeeded = true;
    return;
  }

  const email = (process.env.DEFAULT_ADMIN_EMAIL || 'admin@bookworm.com').toLowerCase();
  const password = process.env.DEFAULT_ADMIN_PASSWORD || 'ChangeMe123!';
  const name = process.env.DEFAULT_ADMIN_NAME || 'BookWorm Admin';

  const admin = initFirebaseAdmin();

  let firebaseUser;
  try {
    firebaseUser = await admin.auth().getUserByEmail(email);
  } catch (error) {
    firebaseUser = await admin.auth().createUser({ email, password, displayName: name });
  }

  await User.create({
    firebaseUid: firebaseUser.uid,
    name,
    email,
    role: 'admin',
  });

  console.log(`Default admin account ready: ${email}`);
  console.log('Please log in and change this password immediately.');
  seeded = global._adminSeeded = true;
}

module.exports = seedAdmin;
