const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const crypto = require('crypto');

// ─── Helpers ─────────────────────────────────────────────────────────────────
function randomString(len) {
  return crypto.randomBytes(len).toString('base64').slice(0, len);
}

function randomHex(len) {
  return crypto.randomBytes(len).toString('hex').slice(0, len);
}

function fakeFallbackUser() {
  const users = [
    { full_name: 'John Doe',     account_number: 'ACC10001', account_type: 'savings',  account_balance: 15420.50,  branch_name: 'Downtown Main Branch' },
    { full_name: 'Jane Smith',   account_number: 'ACC10002', account_type: 'current',  account_balance: 89300.75,  branch_name: 'Westside Banking Center' },
    { full_name: 'Robert Brown', account_number: 'ACC10003', account_type: 'savings',  account_balance: 12500.00,  branch_name: 'North Regional Hub' },
  ];
  return users[Math.floor(Math.random() * users.length)];
}

function makeFakeJwt() {
  const header  = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64');
  const payload = Buffer.from(JSON.stringify({ sub: 'svc_admin', iat: Date.now(), role: 'SYSTEM' })).toString('base64');
  const sig     = randomHex(20);
  return `${header}.${payload}.${sig}`;
}

// Create a credential honeytoken and return its fake data
async function createHoneytoken(attackerIp) {
  try {
    const type = 'credential';
    const rand = () => Math.random().toString(36).slice(2, 8);
    const fakeData = {
      username: `svc_backup_${rand()}`,
      password: randomString(12),
      email: 'backup@securebank.internal',
    };

    const tokenId = crypto.randomUUID();
    const ttlSeconds = 24 * 60 * 60; // 24 hours
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

    // Insert honeytoken with expiry tracking
    await pool.query(
      `INSERT INTO honeytokens 
        (id, type, value, attacker_ip, created_at, issued_at, expires_at, status, ttl_seconds)
       VALUES ($1, $2, $3, $4, NOW(), NOW(), $5, 'active', $6)`,
      [
        tokenId,
        type,
        JSON.stringify(fakeData),
        attackerIp || 'unknown',
        expiresAt,
        ttlSeconds
      ]
    ).catch(() => {});

    return { 
      tokenId, 
      fakeData, 
      expiresAt: expiresAt.toISOString(),
      ttlSeconds
    };
  } catch {
    return null;
  }
}

// ─── POST /api/login ─────────────────────────────────────────────────────────
// INTENTIONALLY VULNERABLE: raw string interpolation for SQLi
router.post('/login', async (req, res) => {
  const { username = '', password = '' } = req.body;

  // VULNERABLE — intentional SQLi surface
  const sqlQuery = `SELECT * FROM users WHERE username = '${username}' AND password = '${password}'`;

  let user = null;
  try {
    const result = await pool.query(sqlQuery);
    if (result.rows.length > 0) {
      user = result.rows[0];
    }
  } catch {
    // SQL error (broken injection) — fall through to fake user
  }

  // If no real user found (failed login or SQLi broke query), return a random fake user
  if (!user) {
    try {
      const fallback = await pool.query('SELECT * FROM users ORDER BY RANDOM() LIMIT 1');
      user = fallback.rows[0] || fakeFallbackUser();
    } catch {
      user = fakeFallbackUser();
    }
  }

  // Create honeytoken and embed subtly in response
  const sourceIp = (req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim();
  const honeyResult = await createHoneytoken(sourceIp);

  const fakeJwt = makeFakeJwt();
  const jwtExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h from now

  const responseUser = {
    name: user.full_name || user.username,
    accountNumber: user.account_number || 'ACC10001',
    accountType: user.account_type || 'savings',
    balance: parseFloat(user.account_balance) || 15420.50,
    branchName: user.branch_name || user.branch_id || 'Downtown Main Branch',
    email: user.email,
    phone: user.phone,
  };

  res.json({
    success: true,
    token: fakeJwt,
    expiresIn: 86400, // 24 hours in seconds
    expiresAt: jwtExpiry.toISOString(),
    user: responseUser,
    // Subtle honeytoken — a thorough attacker might copy these
    _cache: honeyResult ? honeyResult.fakeData : undefined,
    _honeytoken_expires: honeyResult ? honeyResult.expiresAt : undefined,
    _debug: {
      session: randomHex(16),
      internal_service_creds: honeyResult ? `${honeyResult.fakeData.username}:${honeyResult.fakeData.password}` : undefined,
      ttl_seconds: honeyResult ? honeyResult.ttlSeconds : undefined,
    },
  });
});

// ─── GET /api/search ─────────────────────────────────────────────────────────
// INTENTIONALLY VULNERABLE: SQLi + reflected XSS
router.get('/search', async (req, res) => {
  const q = req.query.q || '';

  // VULNERABLE SQL — intentional SQLi surface
  let accounts = [];
  try {
    const result = await pool.query(
      `SELECT username, full_name, account_type, account_number FROM users WHERE full_name LIKE '%${q}%' LIMIT 10`
    );
    accounts = result.rows;
  } catch {
    accounts = [];
  }

  // If no results, return some fake data to look real
  if (accounts.length === 0) {
    accounts = [
      { full_name: 'James Wilson', account_type: 'savings', account_number: 'ACC20045' },
      { full_name: 'Mary Johnson', account_type: 'current', account_number: 'ACC20046' },
    ];
  }

  res.json({
    results: [
      {
        title: 'Search results for: ' + q,   // intentionally reflects q unsanitised
        accounts,
      }
    ]
  });
});

// ─── GET /api/comments ───────────────────────────────────────────────────────
router.get('/comments', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM comments ORDER BY created_at DESC');
    res.json({ success: true, data: result.rows });
  } catch {
    res.json({ success: true, data: [] });
  }
});

// ─── POST /api/comments ──────────────────────────────────────────────────────
// INTENTIONALLY VULNERABLE: stored XSS — no sanitisation
router.post('/comments', async (req, res) => {
  const { author, content } = req.body;
  const ip = (req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim();
  const ua = req.headers['user-agent'] || '';

  try {
    const result = await pool.query(
      `INSERT INTO comments (author, author_type, content, target_type, ip_address, user_agent, created_at)
       VALUES ($1, 'customer', $2, 'feedback', $3, $4, NOW())
       RETURNING comment_id as id, author, content, created_at`,
      [author || 'Anonymous', content || '', ip, ua]
    );
    res.json({
      success: true,
      comment: result.rows[0],
    });
  } catch (err) {
    // Still return success — attacker must believe it worked
    res.json({
      success: true,
      comment: { id: Math.floor(Math.random() * 9999), author, content, created_at: new Date().toISOString() },
    });
  }
});

// ─── GET /api/download ───────────────────────────────────────────────────────
// INTENTIONALLY VULNERABLE: directory traversal — no path.normalize, no .. check
router.get('/download', async (req, res) => {
  const requestedFile = req.query.file || '';
  const path = require('path');

  // VULNERABLE — intentional path traversal surface (no sanitisation)
  const targetPath = path.join('/var/www/documents', requestedFile);

  const fs = require('fs');
  let fileContent = null;

  try {
    fileContent = fs.readFileSync(targetPath, 'utf8');
    return res.json({ success: true, file: requestedFile, content: fileContent });
  } catch {
    // File not found — return error with full path (information disclosure)
    return res.json({
      success: false,
      error: 'Document not found',
      requestedFile,
      path: targetPath,   // intentional info disclosure
    });
  }
});

// ─── POST /api/transfer ──────────────────────────────────────────────────────
// IDOR surface — no authentication check
router.post('/transfer', async (req, res) => {
  const { fromAccount, toAccount, amount } = req.body;
  const ip = (req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim();

  // Log to transaction_alerts (fake suspicious transfer)
  pool.query(
    `INSERT INTO transaction_alerts (alert_type, severity, description, created_at)
     VALUES ('suspicious_transfer', 7, $1, NOW())`,
    [`Transfer attempt: ${fromAccount} -> ${toAccount} amount: ${amount} from IP: ${ip}`]
  ).catch(() => {});

  res.json({
    success: true,
    transactionRef: 'TXN' + Date.now(),
    status: 'processing',
  });
});

// ─── GET /api/session ────────────────────────────────────────────────────────
// Weak predictable token — no signing, no secret
// Now includes expiry tracking for honeypot analysis
router.get('/session', async (req, res) => {
  const { username = 'guest', ttl = '3600' } = req.query; // default 1 hour
  const ttlSeconds = Math.min(parseInt(ttl) || 3600, 86400); // cap at 24h
  const weakToken = Buffer.from(username + ':' + Date.now()).toString('base64');
  
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

  res.json({
    success: true,
    token: weakToken,
    expiresIn: ttlSeconds,
    expiresAt: expiresAt.toISOString(),
    token_format: 'base64(username:timestamp)',
    note: 'Session tokens are base64 encoded — easily decodable',
  });
});

// ─── GET /api/user/:id ───────────────────────────────────────────────────────
// IDOR surface — no auth check, returns full user row
router.get('/user/:id', async (req, res) => {
  const id = req.params.id;
  try {
    const result = await pool.query(
      'SELECT user_id, username, email, phone, full_name, address, account_number, account_balance, account_type FROM users WHERE user_id = $1',
      [id]
    );
    if (result.rows.length > 0) {
      return res.json({ success: true, data: result.rows[0] });
    }
    // If not found, return a random user (still convincing)
    const fallback = await pool.query('SELECT user_id, username, email, phone, full_name, address, account_number, account_balance, account_type FROM users ORDER BY RANDOM() LIMIT 1');
    res.json({ success: true, data: fallback.rows[0] || {} });
  } catch {
    res.json({ success: true, data: { id, username: 'customer', email: 'customer@securebank.com' } });
  }
});

// ─── GET /api/accounts ───────────────────────────────────────────────────────
// Returns list of all accounts (another IDOR surface)
router.get('/accounts', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT user_id, full_name, account_number, account_type, account_balance FROM users LIMIT 20'
    );
    res.json({ success: true, data: result.rows });
  } catch {
    res.json({ success: true, data: [] });
  }
});

// ─── GET /api/transactions ───────────────────────────────────────────────────
router.get('/transactions', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT transaction_id as id, created_at as date, remarks as description, amount, transaction_type as category, status FROM transactions ORDER BY created_at DESC LIMIT 20'
    );
    const formatted = result.rows.map(t => ({ ...t, amount: parseFloat(t.amount) }));
    res.json({ success: true, data: formatted });
  } catch {
    // Return fake transaction data
    res.json({
      success: true,
      data: [
        { id: 1, date: new Date().toISOString(), description: 'Salary Deposit', amount: 5000.00, category: 'Income', status: 'completed' },
        { id: 2, date: new Date().toISOString(), description: 'Amazon Purchase', amount: -125.50, category: 'Shopping', status: 'completed' },
      ]
    });
  }
});

module.exports = router;
