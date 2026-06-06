const express = require('express');
const router = express.Router();
const pool = require('../db/connection'); // FIXED: Changed from '../db/pool' to '../db/connection'
const crypto = require('crypto');
// const alertEngine = require('../services/alertEngine'); // Uncomment if you have this

function randomString(len) {
  return crypto.randomBytes(len).toString('base64').slice(0, len);
}

function randomHex(len) {
  return crypto.randomBytes(len).toString('hex').slice(0, len);
}

// Severity mapping for alerts
const severityMap = {
  LOW: 3,
  MEDIUM: 5,
  HIGH: 7,
  CRITICAL: 9
};

// Generate fake honeytoken data by type
function generateFakeData(type) {
  const rand = () => Math.random().toString(36).slice(2, 8);
  switch (type) {
    case 'credential':
      return {
        username: `svc_backup_${rand()}`,
        password: randomString(12),
        email: 'backup@securebank.internal',
        note: '⚠️ DECOY CREDENTIAL - DO NOT USE ⚠️'
      };
    case 'apikey':
      return {
        key: `sk_live_${randomHex(32)}`,
        service: 'SecureBank Payment API v2',
        environment: 'production',
        note: '⚠️ DECOY API KEY - MONITORED BY SOC ⚠️'
      };
    case 'file':
      return {
        filename: 'customer_export_2024.csv',
        path: '/internal/exports/sensitive/',
        size: '2.4 MB',
        note: '⚠️ DECOY FILE - ACCESS LOGGED ⚠️'
      };
    default:
      return { key: randomHex(16), type: 'generic_decoy' };
  }
}

// ─── POST /api/honeytokens/create ────────────────────────────────────────────
router.post('/create', async (req, res) => {
  const { type = 'credential', attackerIp, ttlSeconds = 86400 } = req.body;
  const tokenId = crypto.randomUUID();
  const fakeData = generateFakeData(type);
  
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

  try {
    // FIXED: Removed 'issued_at' column (not in your schema)
    await pool.query(
      `INSERT INTO honeytokens 
        (id, type, value, attacker_ip, created_at, expires_at, status, ttl_seconds)
       VALUES ($1, $2, $3, $4, NOW(), $5, 'active', $6)`,
      [
        tokenId,
        type,
        JSON.stringify(fakeData),
        attackerIp || null,  // Changed from 'unknown' to NULL to match schema
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
        ttlSeconds,
        created_at: now.toISOString()
      } 
    });
  } catch (err) {
    console.error('Error creating honeytoken:', err.message);
    // Still return success for honeypot convincingness
    res.json({ 
      success: true, 
      data: { 
        tokenId, 
        type, 
        ...fakeData, 
        status: 'active',
        expiresAt: expiresAt.toISOString(),
        ttlSeconds,
        created_at: now.toISOString(),
        _warning: 'Token created but database error occurred'
      } 
    });
  }
});

// ─── POST /api/honeytokens/:id/trigger ───────────────────────────────────────
router.post('/:id/trigger', async (req, res) => {
  const { id } = req.params;
  const { attackerIp } = req.body;
  const triggeredAt = new Date();
  
  // Clean IP address
  let ip = (req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim();
  ip = ip.replace(/^::ffff:/, '');
  if (ip === '::1') ip = '127.0.0.1';

  try {
    // Check if token exists and get its status
    const checkResult = await pool.query(
      `SELECT id, status, expires_at, created_at, type, value FROM honeytokens WHERE id = $1`,
      [id]
    );

    let isExpired = false;
    let severity = 'CRITICAL';
    let alertType = 'HONEYTOKEN_TRIGGERED';
    let tokenExists = checkResult.rows.length > 0;
    let token = tokenExists ? checkResult.rows[0] : null;

    if (tokenExists) {
      const now = new Date();
      isExpired = new Date(token.expires_at) < now;
      
      if (isExpired) {
        alertType = 'EXPIRED_HONEYTOKEN_TRIGGERED';
        severity = 'HIGH';
        
        // Update token status to expired and record expired_use_at
        await pool.query(
          `UPDATE honeytokens 
           SET status = 'expired', 
               expired_use_at = NOW(),
               triggered_at = NOW()
           WHERE id = $1`,
          [id]
        );
      } else if (token.status === 'active') {
        // Token is still active and not yet triggered
        await pool.query(
          `UPDATE honeytokens 
           SET status = 'triggered', 
               triggered_at = NOW()
           WHERE id = $1`,
          [id]
        );
      } else if (token.status === 'triggered') {
        // Already triggered before
        alertType = 'HONEYTOKEN_REUSE';
        severity = 'CRITICAL';
      }
    }

    // Log the honeytoken alert event
    const alertIp = attackerIp || ip;
    await pool.query(
      `INSERT INTO honeytoken_alerts (honeytoken_id, attacker_ip, triggered_at, severity, details)
       VALUES ($1, $2, NOW(), $3, $4)`,
      [
        id,
        alertIp,
        severity === 'CRITICAL' ? severityMap.CRITICAL : severityMap.HIGH,
        JSON.stringify({
          isExpired,
          wasExpiredMs: isExpired && token ? (new Date() - new Date(token.expires_at)) : 0,
          tokenId: id,
          alertType,
          tokenType: token?.type || 'unknown',
          tokenValue: token?.value || null
        })
      ]
    );

    // Fire alert if you have alertEngine
    if (typeof alertEngine !== 'undefined' && alertEngine.sendCritical) {
      alertEngine.sendCritical({
        ip: alertIp,
        country: 'Unknown',
        attack_type: alertType,
        payload: `Honeytoken ${id} ${isExpired ? '(EXPIRED)' : ''} ${token?.status === 'triggered' ? '(REUSED)' : ''} triggered`,
        timestamp: triggeredAt.toISOString(),
        honeytokenId: id,
        isExpired,
      }).catch(() => {});
    }

    res.json({
      success: true,
      alert: {
        severity: severity,
        severity_level: severity === 'CRITICAL' ? 9 : 7,
        honeytokenId: id,
        attackerIp: alertIp,
        triggeredAt: triggeredAt.toISOString(),
        isExpired,
        status: isExpired ? 'expired_reused' : (token?.status === 'triggered' ? 'active_triggered' : 'triggered'),
        alertType: alertType
      },
    });
  } catch (err) {
    console.error('Error triggering honeytoken:', err.message);
    res.json({
      success: true,
      alert: {
        severity: 'CRITICAL',
        severity_level: 9,
        honeytokenId: id,
        attackerIp: attackerIp || ip,
        triggeredAt: triggeredAt.toISOString(),
        isExpired: false,
        status: 'triggered',
        alertType: 'HONEYTOKEN_TRIGGERED'
      },
    });
  }
});

// ─── GET /api/honeytokens ─────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
        id, 
        type, 
        attacker_ip, 
        created_at, 
        expires_at, 
        status, 
        ttl_seconds,
        triggered_at,
        expired_use_at,
        (NOW() > expires_at) as is_expired,
        EXTRACT(EPOCH FROM (expires_at - NOW())) as seconds_remaining
       FROM honeytokens
       ORDER BY created_at DESC 
       LIMIT 100`
    );
    res.json({ success: true, honeytokens: result.rows }); // FIXED: Changed 'data' to 'honeytokens' to match frontend
  } catch (err) {
    console.error('Error fetching honeytokens:', err.message);
    res.json({ success: true, honeytokens: [] });
  }
});

// ─── GET /api/honeytokens/triggered ──────────────────────────────────────────
router.get('/triggered', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
        id, 
        type, 
        attacker_ip, 
        created_at, 
        triggered_at, 
        expires_at, 
        status,
        (NOW() > expires_at) as is_expired,
        EXTRACT(EPOCH FROM (triggered_at - expires_at)) as triggered_after_expiry_seconds
       FROM honeytokens
       WHERE status IN ('triggered', 'expired')
       ORDER BY triggered_at DESC 
       LIMIT 100`
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Error fetching triggered honeytokens:', err.message);
    res.json({ success: true, data: [] });
  }
});

// ─── GET /api/honeytokens/active ────────────────────────────────────────────
router.get('/active', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
        id, 
        type, 
        attacker_ip, 
        created_at, 
        expires_at, 
        status, 
        ttl_seconds,
        EXTRACT(EPOCH FROM (expires_at - NOW())) as seconds_remaining
       FROM honeytokens
       WHERE status = 'active' AND expires_at > NOW()
       ORDER BY expires_at ASC 
       LIMIT 50`
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Error fetching active honeytokens:', err.message);
    res.json({ success: true, data: [] });
  }
});

// ─── GET /api/honeytokens/:id ─────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `SELECT 
        id, 
        type, 
        value, 
        attacker_ip, 
        created_at, 
        expires_at, 
        triggered_at, 
        expired_use_at, 
        status, 
        ttl_seconds,
        (NOW() > expires_at) as is_expired,
        EXTRACT(EPOCH FROM (expires_at - NOW())) as seconds_remaining
       FROM honeytokens 
       WHERE id = $1`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Honeytoken not found' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Error fetching honeytoken:', err.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// ─── DELETE /api/honeytokens/:id ──────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `UPDATE honeytokens
       SET status = 'inactive'
       WHERE id = $1
       RETURNING id`,
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Honeytoken not found' });
    }
    
    res.json({ success: true, message: 'Honeytoken revoked' });
  } catch (err) {
    console.error('Error revoking honeytoken:', err.message);
    res.status(500).json({ success: false, error: 'Server error' });
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
  } catch (err) {
    console.error('Error fetching stats:', err.message);
    res.json({ success: true, data: { total_tokens: 0, active_tokens: 0, triggered_count: 0, expired_count: 0, inactive_count: 0, reused_after_expiry: 0 } });
  }
});

module.exports = router;