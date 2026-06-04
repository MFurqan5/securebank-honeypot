const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const crypto = require('crypto');

// In-memory sequence counters per session
const seqCounters = new Map();

// ─── POST /api/sessions/create ───────────────────────────────────────────────
router.post('/create', async (req, res) => {
  const { attackerIp } = req.body;
  const sessionId = crypto.randomUUID();

  try {
    await pool.query(
      `INSERT INTO session_replays (session_id, ip, actions, created_at)
       VALUES ($1, $2, '[]', NOW())`,
      [sessionId, attackerIp || 'unknown']
    );
  } catch {
    // ignore — may already exist
  }

  res.json({ success: true, sessionId });
});

// ─── POST /api/sessions/:id/record ───────────────────────────────────────────
// Internal use by middleware
router.post('/:id/record', async (req, res) => {
  const { id } = req.params;
  const { method, path, body, responseCode } = req.body;

  const seq = (seqCounters.get(id) || 0) + 1;
  seqCounters.set(id, seq);

  const entry = {
    sequence_number: seq,
    timestamp: new Date().toISOString(),
    method,
    path,
    body: body || {},
    responseCode,
  };

  try {
    await pool.query(
      `INSERT INTO session_replays (session_id, ip, actions, created_at)
       VALUES ($1, 'unknown', $2, NOW())
       ON CONFLICT (session_id) DO UPDATE
         SET actions = (session_replays.actions::jsonb || $2::jsonb)::text`,
      [id, JSON.stringify([entry])]
    );
    res.json({ success: true, sequence_number: seq });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ─── GET /api/sessions/:id/replay ────────────────────────────────────────────
router.get('/:id/replay', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `SELECT * FROM session_replays WHERE session_id = $1`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.json({ success: false, error: 'Session not found' });
    }
    const row = result.rows[0];
    let actions = [];
    try { actions = JSON.parse(row.actions); } catch { actions = []; }

    // Sort by sequence_number if available
    actions.sort((a, b) => (a.sequence_number || 0) - (b.sequence_number || 0));
    res.json({ success: true, data: { session_id: id, ip: row.ip, created_at: row.created_at, actions } });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ─── GET /api/sessions/:id/timeline ──────────────────────────────────────────
router.get('/:id/timeline', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `SELECT * FROM session_replays WHERE session_id = $1`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.json({ success: false, error: 'Session not found' });
    }
    const row = result.rows[0];
    let actions = [];
    try { actions = JSON.parse(row.actions); } catch { actions = []; }
    actions.sort((a, b) => (a.sequence_number || 0) - (b.sequence_number || 0));

    const timeline = actions.map((a, i) => ({
      step: i + 1,
      timestamp: a.timestamp,
      method: a.method,
      path: a.path,
      responseCode: a.responseCode,
      payload: a.body,
      timeSincePrevious: i > 0
        ? new Date(a.timestamp) - new Date(actions[i - 1].timestamp)
        : 0,
    }));

    res.json({ success: true, data: timeline });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ─── GET /api/sessions/ip/:ip ─────────────────────────────────────────────────
router.get('/ip/:ip', async (req, res) => {
  const { ip } = req.params;
  try {
    const result = await pool.query(
      `SELECT session_id, ip, created_at,
              jsonb_array_length(actions::jsonb) as request_count
       FROM session_replays
       WHERE ip = $1
         AND session_id NOT LIKE 'honeytoken_%'
       ORDER BY created_at DESC`,
      [ip]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ─── GET /api/sessions ────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT session_id, ip, created_at
       FROM session_replays
       WHERE session_id NOT LIKE 'honeytoken_%'
       ORDER BY created_at DESC
       LIMIT 50`
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

module.exports = router;
