const express = require("express");
const router = express.Router();
const pool = require("../db/pool");
const crypto = require("crypto");

// In-memory sequence counters per session
const seqCounters = new Map();

// ─── POST /api/sessions/create ───────────────────────────────────────────────
router.post("/create", async (req, res) => {
  const { attackerIp } = req.body;
  const sessionId = crypto.randomUUID();

  try {
    await pool.query(
      `INSERT INTO session_recordings (session_id, attacker_ip, timestamp)
       VALUES ($1, $2, NOW())`,
      [sessionId, attackerIp || "unknown"],
    );
  } catch {
    // ignore — may already exist
  }

  res.json({ success: true, sessionId });
});

// ─── POST /api/sessions/:id/record ───────────────────────────────────────────
// Internal use by middleware
router.post("/:id/record", async (req, res) => {
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
      `INSERT INTO session_recordings (session_id, attacker_ip, request_method, request_path, request_body, response_code, timestamp, sequence_number)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7)`,
      [id, 'unknown', method, path, JSON.stringify(body || {}), responseCode, seq]
    );
    res.json({ success: true, sequence_number: seq });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ─── GET /api/sessions/:id/replay ────────────────────────────────────────────
router.get("/:id/replay", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `SELECT session_id, attacker_ip, request_method, request_path, request_body, response_code, timestamp, sequence_number
       FROM session_recordings 
       WHERE session_id = $1
       ORDER BY sequence_number ASC`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.json({ success: false, error: 'Session not found' });
    }

    res.json({ success: true, data: { session_id: id, recordings: result.rows } });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ─── GET /api/sessions/:id/timeline ──────────────────────────────────────────
router.get('/:id/timeline', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `SELECT sequence_number, timestamp, request_method as method, request_path as path, 
              response_code, request_body as body
       FROM session_recordings 
       WHERE session_id = $1
       ORDER BY sequence_number ASC`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.json({ success: false, error: 'Session not found' });
    }

    const timeline = result.rows.map((row, i) => ({
      step: i + 1,
      timestamp: row.timestamp,
      method: row.method,
      path: row.path,
      responseCode: row.response_code,
      payload: row.body,
      timeSincePrevious: i > 0 ? new Date(row.timestamp) - new Date(result.rows[i - 1].timestamp) : 0,
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
      `SELECT session_id, attacker_ip, COUNT(*) as request_count
       FROM session_recordings
       WHERE attacker_ip = $1
       GROUP BY session_id, attacker_ip
       ORDER BY MAX(timestamp) DESC`,
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
      `SELECT DISTINCT session_id, attacker_ip, MIN(timestamp) as created_at, COUNT(*) as request_count
       FROM session_recordings
       GROUP BY session_id, attacker_ip
       ORDER BY MIN(timestamp) DESC
       LIMIT 50`
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

module.exports = router;
