const mongoose = require('mongoose');
const dns = require('dns');

// On Vercel (and any serverless platform), the module scope can be reused
// across invocations on a "warm" instance, but a fresh require() happens on
// cold starts. Caching the connection on `global` means a warm invocation
// reuses the existing connection instead of opening a new one every request
// - without this, you can quickly hit MongoDB Atlas's connection limit.
let cached = global._mongooseCache;
if (!cached) {
  cached = global._mongooseCache = { conn: null, promise: null };
}

async function connectDB() {
  if (cached.conn) {
    return cached.conn;
  }

  const uri = process.env.MONGODB_URI;

  if (!uri) {
    console.error('MONGODB_URI is not set. Please add it to your .env file (or Vercel project env vars).');
    throw new Error('MONGODB_URI is not set.');
  }

  // Some ISPs/routers/VPNs don't resolve the DNS SRV record that
  // `mongodb+srv://` URIs depend on ("querySrv ECONNREFUSED ..."), even
  // though the machine has normal internet access otherwise. Setting
  // FORCE_DNS_SERVERS in .env (e.g. "8.8.8.8,8.8.4.4") points Node's own
  // resolver at a DNS server that does support SRV lookups, without
  // touching OS-wide network settings. (Not usually needed on Vercel itself
  // - this is mainly for local dev on a restrictive network.)
  if (process.env.FORCE_DNS_SERVERS) {
    const servers = process.env.FORCE_DNS_SERVERS.split(',').map((s) => s.trim());
    dns.setServers(servers);
    console.log(`Using custom DNS servers for MongoDB lookup: ${servers.join(', ')}`);
  }

  if (!cached.promise) {
    cached.promise = mongoose
      .connect(uri, {
        // Fail fast instead of hanging - much easier to debug on Vercel,
        // where a hung connection just looks like a timed-out function.
        serverSelectionTimeoutMS: 8000,
      })
      .then((m) => {
        console.log(`MongoDB connected: ${m.connection.host}/${m.connection.name}`);
        return m;
      })
      .catch((error) => {
        cached.promise = null; // let the next invocation retry instead of reusing a failed promise
        console.error(`MongoDB connection failed: ${error.message}`);
        if (error.message.includes('querySrv')) {
          console.error(
            'This looks like a DNS problem, not a MongoDB problem: your network cannot resolve ' +
              "the mongodb+srv:// SRV record. Try setting FORCE_DNS_SERVERS=8.8.8.8,8.8.4.4 in .env, " +
              'or switch your Wi-Fi/network DNS to 8.8.8.8. See README.md for the full checklist.'
          );
        }
        throw error;
      });
  }

  cached.conn = await cached.promise;
  return cached.conn;
}

module.exports = connectDB;
