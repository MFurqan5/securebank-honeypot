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
  const { type = 'credential', attackerIp, ttlSeconds = 86400 } = req.body; // default 24h
  const tokenId = crypto.randomUUID();
  const fakeData = generateFakeData(type);
  
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

  try {
    // Insert with proper expiry tracking
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
    );

    res.json({ 
      success: true, 
      data: { 
        tokenId, 
        type, 
        ...fakeData, 
        status: 'active',
        expiresAt: expiresAt.toISOString(),
        ttlSeconds
      } 
    });
  } catch (err) {
    // Still return success for honeypot convincingness
    res.json({ 
      success: true, 
      data: { 
        tokenId, 
        type, 
        ...fakeData, 
        status: 'active',
        expiresAt: expiresAt.toISOString(),
        ttlSeconds
      } 
    });
  }
});

// ─── POST /api/honeytokens/:id/trigger ───────────────────────────────────────
router.post('/:id/trigger', async (req, res) => {
  const { id } = req.params;
  const { attackerIp } = req.body;
  const triggeredAt = new Date().toISOString();
  const ip = (req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim();

  try {
    // Check if token exists and if it's expired
    const checkResult = await pool.query(
      `SELECT status, expires_at, created_at FROM honeytokens WHERE id = $1`,
      [id]
    ).catch(() => ({ rows: [] }));

    const token = checkResult.rows?.[0];
    let isExpired = false;
    let severity = 'CRITICAL';
    let alertType = 'HONEYTOKEN_TRIGGERED';

    if (token) {
      const now = new Date();
      isExpired = new Date(token.expires_at) < now;
      
      if (isExpired) {
        alertType = 'EXPIRED_HONEYTOKEN_TRIGGERED';
        severity = 'HIGH'; // still critical but distinct from active honeytoken use
        
        // Update token status to expired
        await pool.query(
          `UPDATE honeytokens 
           SET status = 'expired', expired_use_at = NOW()
           WHERE id = $1`,
          [id]
        ).catch(() => {});
      } else {
        // Token is still active — update to triggered
        await pool.query(
          `UPDATE honeytokens 
           SET status = 'triggered', triggered_at = NOW()
           WHERE id = $1`,
          [id]
        ).catch(() => {});
      }
    }

    // Fire alert with severity based on expiry status
    alertEngine.sendCritical({
      ip: attackerIp || ip,
      country: 'Unknown',
      attack_type: alertType,
      payload: `Honeytoken ${id} ${isExpired ? '(EXPIRED)' : ''} triggered`,
      timestamp: triggeredAt,
      honeytokenId: id,
      isExpired,
    }).catch(() => {});

    // Log the honeytoken alert event
    await pool.query(
      `INSERT INTO honeytoken_alerts (honeytoken_id, attacker_ip, triggered_at, severity, details)
       VALUES ($1, $2, NOW(), $3, $4)`,
      [
        id,
        attackerIp || ip,
        isExpired ? 'HIGH' : 'CRITICAL',
        JSON.stringify({
          isExpired,
          wasExpiredMs: isExpired && token ? (new Date() - new Date(token.expires_at)) : 0,
          tokenId: id,
          alertType
        })
      ]
    ).catch(() => {});

    res.json({
      success: true,
      alert: {
        severity: isExpired ? 'HIGH' : 'CRITICAL',
        honeytokenId: id,
        attackerIp: attackerIp || ip,
        triggeredAt,
        isExpired,
        status: isExpired ? 'expired_reused' : 'active_triggered',
      },
    });
  } catch (err) {
    res.json({
      success: true,
      alert: {
        severity: 'CRITICAL',
        honeytokenId: id,
        attackerIp: attackerIp || ip,
        triggeredAt,
      },
    });
  }
});

// ─── GET /api/honeytokens ─────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
        id, type, attacker_ip, created_at, issued_at, expires_at, status, ttl_seconds,
        (NOW() > expires_at) as is_expired,
        EXTRACT(EPOCH FROM (expires_at - NOW())) as seconds_remaining
       FROM honeytokens
       ORDER BY created_at DESC LIMIT 100`
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
      `SELECT 
        id, type, attacker_ip, created_at, triggered_at, expires_at, status,
        (NOW() > expires_at) as is_expired,
        EXTRACT(EPOCH FROM (triggered_at - expires_at)) as triggered_after_expiry_seconds
       FROM honeytokens
       WHERE status IN ('triggered', 'expired')
       ORDER BY triggered_at DESC LIMIT 100`
    );
    res.json({ success: true, data: result.rows });
  } catch {
    res.json({ success: true, data: [] });
  }
});

// ─── GET /api/honeytokens/active ────────────────────────────────────────────
router.get('/active', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
        id, type, attacker_ip, created_at, expires_at, status, ttl_seconds,
        EXTRACT(EPOCH FROM (expires_at - NOW())) as seconds_remaining
       FROM honeytokens
       WHERE status = 'active' AND expires_at > NOW()
       ORDER BY expires_at ASC LIMIT 50`
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
      `SELECT 
        id, type, value, attacker_ip, created_at, issued_at, expires_at, 
        triggered_at, expired_use_at, status, ttl_seconds,
        (NOW() > expires_at) as is_expired,
        EXTRACT(EPOCH FROM (expires_at - NOW())) as seconds_remaining
       FROM honeytokens 
       WHERE id = $1`,
      [id]
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
      `UPDATE honeytokens
       SET status = 'inactive'
       WHERE id = $1`,
      [id]
    );
    res.json({ success: true });
  } catch {
    res.json({ success: true });
  }
});

// ─── GET /api/honeytokens/stats/summary ───────────────────────────────────────
router.get('/stats/summary', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
        COUNT(*) as total_tokens,
        COUNT(CASE WHEN status = 'active' AND expires_at > NOW() THEN 1 END) as active_tokens,
        COUNT(CASE WHEN status = 'triggered' THEN 1 END) as triggered_count,
        COUNT(CASE WHEN status = 'expired' OR expires_at <= NOW() THEN 1 END) as expired_count,
        COUNT(CASE WHEN status = 'inactive' THEN 1 END) as inactive_count,
        COUNT(CASE WHEN expired_use_at IS NOT NULL THEN 1 END) as reused_after_expiry
       FROM honeytokens`
    );
    res.json({ success: true, data: result.rows[0] });
  } catch {
    res.json({ success: true, data: { error: 'Could not fetch stats' } });
  }
});

module.exports = router;
