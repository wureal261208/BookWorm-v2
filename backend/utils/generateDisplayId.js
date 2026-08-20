const Counter = require('../models/Counter');

// Human-readable account IDs, distinct from Mongo's _id / the Firebase uid:
//   admin    -> AD-000001
//   manager  -> MA-000001
//   employee -> EM-000001
//   customer -> 000001 (numbers only, no prefix)
const ROLE_PREFIXES = { admin: 'AD', manager: 'MA', employee: 'EM' };

async function generateDisplayId(role) {
  const key = `user_${role}`;
  const counter = await Counter.findOneAndUpdate(
    { _id: key },
    { $inc: { seq: 1 } },
    { upsert: true, new: true }
  );

  const padded = String(counter.seq).padStart(6, '0');
  const prefix = ROLE_PREFIXES[role];
  return prefix ? `${prefix}-${padded}` : padded;
}

module.exports = generateDisplayId;
