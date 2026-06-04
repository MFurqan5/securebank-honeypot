const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const crypto = require('crypto');
const alertEngine = require('../services/alertEngine');

function randomString(len) {
  return crypto.randomBytes(len).toString('base64').slice(0, len);
}

function randomHex(len) {
  return crypto.randomBytes(len).toString('hex').slice(0, len);
}

// Generate fake honeytoken data by type
function generateFakeData(type) {
  const rand = () => Math.random().toString(36).slice(2, 8);
  switch (type) {
    case 'credential':
      return {
        username: `svc_backup_${rand()}`,
        password: randomString(12),
        email: 'backup@securebank.internal',
      };
    case 'apikey':
      return {
        key: `sk_live_${randomHex(32)}`,
        service: 'SecureBank Payment API v2',
      };
    case 'file':
      return {
        filename: 'customer_export_2024.csv',
        path: '/internal/exports/sensitive/',
      };
    default:
      return { key: randomHex(16) };
  }
}

// ─── POST /api/honeytokens/create ────────────────────────────────────────────
router.post('/create', async (req, res) => {
  const { type = 'credential', attackerIp } = req.body;
  const tokenId = crypto.randomUUID();
  const fakeData = generateFakeData(type);

  try {
    // Store in session_replays as a honeytoken record (since honeytokens table doesn't exist)
    await pool.query(
      `INSERT INTO session_replays (session_id, ip, actions, created_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (session_id) DO NOTHING`,
      [
        `honeytoken_${tokenId}`,
        attackerIp || 'unknown',
        JSON.stringify([{
          type: 'honeytoken_created',
          tokenId,
          tokenType: type,
          fakeData,
          status: 'active',
          created_at: new Date().toISOString(),
        }])
      ]
    );

    res.json({ success: true, data: { tokenId, type, ...fakeData, status: 'active' } });
  } catch (err) {
    res.json({ success: true, data: { tokenId, type, ...fakeData, status: 'active' } });
  }
});

// ─── POST /api/honeytokens/:id/trigger ───────────────────────────────────────
router.post('/:id/trigger', async (req, res) => {
  const { id } = req.params;
  const { attackerIp } = req.body;
  const triggeredAt = new Date().toISOString();
  const ip = (req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim();

  // Fire CRITICAL alert immediately
  alertEngine.sendCritical({
    ip: attackerIp || ip,
    country: 'Unknown',
    attack_type: 'HONEYTOKEN_TRIGGERED',
    payload: `Honeytoken ${id} triggered`,
    timestamp: triggeredAt,
    honeytokenId: id,
  }).catch(() => {});

  // Update the session_replays record for this honeytoken
  pool.query(
    `UPDATE session_replays
     SET actions = (actions::jsonb || $2::jsonb)::text
     WHERE session_id = $1`,
    [
      `honeytoken_${id}`,
      JSON.stringify([{
        type: 'honeytoken_triggered',
        tokenId: id,
        attackerIp: attackerIp || ip,
        triggeredAt,
      }])
    ]
  ).catch(() => {});

  res.json({
    success: true,
    alert: {
      severity: 'CRITICAL',
      honeytokenId: id,
      attackerIp: attackerIp || ip,
      triggeredAt,
    },
  });
});

// ─── GET /api/honeytokens ─────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT session_id, ip, created_at, actions
       FROM session_replays
       WHERE session_id LIKE 'honeytoken_%'
       ORDER BY created_at DESC`
    );
    res.json({ success: true, data: result.rows });
  } catch {
    res.json({ success: true, data: [] });
  }
});

// ─── GET /api/honeytokens/triggered ──────────────────────────────────────────
router.get('/triggered', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT session_id, ip, created_at, actions
       FROM session_replays
       WHERE session_id LIKE 'honeytoken_%'
         AND actions LIKE '%honeytoken_triggered%'
       ORDER BY created_at DESC`
    );
    res.json({ success: true, data: result.rows });
  } catch {
    res.json({ success: true, data: [] });
  }
});

// ─── GET /api/honeytokens/:id ─────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `SELECT * FROM session_replays WHERE session_id = $1`,
      [`honeytoken_${id}`]
    );
    if (result.rows.length === 0) {
      return res.json({ success: false, error: 'Honeytoken not found' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch {
    res.json({ success: false, error: 'Not found' });
  }
});

// ─── DELETE /api/honeytokens/:id ──────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query(
      `UPDATE session_replays
       SET actions = (actions::jsonb || '[{"status":"inactive"}]'::jsonb)::text
       WHERE session_id = $1`,
      [`honeytoken_${id}`]
    );
    res.json({ success: true });
  } catch {
    res.json({ success: true });
  }
});

module.exports = router;
