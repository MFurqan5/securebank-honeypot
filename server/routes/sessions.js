const express = require("express");
const router = express.Router();
const pool = require("../db/connection"); // FIXED: changed from '../db/pool'
const crypto = require("crypto");

// In-memory sequence counters per session
const seqCounters = new Map();

// ─── POST /api/sessions/create ───────────────────────────────────────────────
router.post("/create", async (req, res) => {
  const { attackerIp } = req.body;
  const sessionId = crypto.randomUUID();
  
  // Clean IP
  let cleanIp = (attackerIp || 'unknown').replace(/^::ffff:/, '');
  if (cleanIp === '::1') cleanIp = '127.0.0.1';

  try {
    await pool.query(
      `INSERT INTO session_recordings (session_id, attacker_ip, timestamp)
       VALUES ($1, $2, NOW())`,
      [sessionId, cleanIp]
    );
    res.json({ success: true, sessionId });
  } catch (err) {
    console.error('Session create error:', err.message);
    res.json({ success: true, sessionId }); // Still return ID even on error
  }
});

// ─── POST /api/sessions/:id/record ───────────────────────────────────────────
router.post("/:id/record", async (req, res) => {
  const { id } = req.params;
  const { method, path, body, responseCode, attackerIp } = req.body;

  const seq = (seqCounters.get(id) || 0) + 1;
  seqCounters.set(id, seq);
  
  // Clean IP
  let cleanIp = (attackerIp || 'unknown').replace(/^::ffff:/, '');
  if (cleanIp === '::1') cleanIp = '127.0.0.1';

  try {
    await pool.query(
      `INSERT INTO session_recordings 
        (session_id, attacker_ip, request_method, request_path, request_body, response_code, timestamp, sequence_number)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7)`,
      [id, cleanIp, method, path, JSON.stringify(body || {}), responseCode, seq]
    );
    res.json({ success: true, sequence_number: seq });
  } catch (err) {
    console.error('Record error:', err.message);
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
    console.error('Replay error:', err.message);
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
    console.error('Sessions list error:', err.message);
    res.json({ success: true, data: [] });
  }
});

module.exports = router;