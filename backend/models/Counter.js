const mongoose = require('mongoose');

// Generic atomic sequence counter, one document per counter key (e.g.
// "user_admin", "user_customer"). Used to hand out gap-free, race-safe
// running numbers for human-readable IDs like AD-000001.
const CounterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
});

module.exports = mongoose.model('Counter', CounterSchema);
