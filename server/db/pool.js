const { Pool } = require('pg');

// Use environment variable for Neon.tech connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Required for Neon.tech
  },
  // Optional: Add connection timeout
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
});

// Test connection on startup
pool.connect((err, client, release) => {
  if (err) {
    console.error('[DB] Error connecting to database:', err.stack);
  } else {
    console.log('[DB] Connected to database successfully');
    release();
  }
});

module.exports = pool;