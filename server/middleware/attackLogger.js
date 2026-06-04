const pool = require('../db/pool');
const geoip = require('../services/geoip');
const fingerprint = require('../services/fingerprint');
const abuseipdb = require('../services/abuseipdb');

// In-memory rate tracker for brute force detection: { ip: [timestamps] }
const loginAttempts = new Map();

// Token expiry tracking: { ip: { expiryAttempts, lastAttempt } }
const expiredTokenAttempts = new Map();

// ─── Classification ─────────────────────────────────────────────────────────
function classifyAttack(payload, path, method) {
  const p = (payload || '').toLowerCase();
  const pathLower = (path || '').toLowerCase();

  // SQLi detection
  const sqliPatterns = ["'", '--', 'or 1=1', 'union select', 'sleep(', 'having', 'drop table', 'insert into', 'update set', "=%27", "%27or", "'='"];
  for (const pat of sqliPatterns) {
    if (p.includes(pat.toLowerCase())) {
      let sub = 'generic';
      if (p.includes('union select') || p.includes('union%20select')) sub = 'union_based';
      else if (p.includes('or 1=1') || p.includes("or '1'='1")) sub = 'auth_bypass';
      else if (p.includes('sleep(')) sub = 'blind';

      let severity = 8; // MEDIUM-HIGH
      if (sub === 'union_based' || sub === 'blind') severity = 9; // CRITICAL
      else if (sub === 'auth_bypass') severity = 8; // HIGH

      return { attack_type: 'sqli', sub_attack_type: sub, severity };
    }
  }

  // XSS detection
  const xssPatterns = ['<script', '</script>', 'onerror=', 'onload=', 'javascript:', '<img', '<svg', 'alert(', 'document.cookie', 'fetch(', 'xmlhttprequest'];
  for (const pat of xssPatterns) {
    if (p.includes(pat.toLowerCase())) {
      const sub = (method === 'POST' && pathLower.includes('/comments')) ? 'stored' : 'reflected';
      let severity = 7; // HIGH
      if (p.includes('document.cookie') || p.includes('fetch(')) severity = 9; // CRITICAL

      return { attack_type: 'xss', sub_attack_type: sub, severity };
    }
  }

  // Path traversal detection
  const traversalPatterns = ['../', '..\\', '%2f..', '%2e%2e', '....//'];
  const sensitiveFiles = ['/etc/passwd', '/etc/shadow', '/proc/', '/windows/system32'];
  for (const pat of traversalPatterns) {
    if (p.includes(pat.toLowerCase())) {
      const severity = sensitiveFiles.some(f => p.includes(f)) ? 9 : 7; // 9=CRITICAL, 7=HIGH
      return { attack_type: 'traversal', sub_attack_type: 'path_traversal', severity };
    }
  }
  for (const f of sensitiveFiles) {
    if (p.includes(f)) {
      return { attack_type: 'traversal', sub_attack_type: 'path_traversal', severity: 9 }; // CRITICAL
    }
  }

  // Recon detection
  const reconPaths = ['/admin', '/wp-login', '/.env', '/phpinfo', '/config', '/.git', '/backup'];
  for (const rp of reconPaths) {
    if (pathLower.includes(rp)) {
      return { attack_type: 'recon', sub_attack_type: 'recon_scan', severity: 3 }; // LOW
    }
  }

  return { attack_type: null, sub_attack_type: null, severity: 1 }; // LOW
}

// ─── Brute force tracker ────────────────────────────────────────────────────
function checkBruteForce(ip, path, method) {
  if (method !== 'POST' || !path.includes('/api/login')) return false;

  const now = Date.now();
  const windowMs = 60 * 1000;

  if (!loginAttempts.has(ip)) loginAttempts.set(ip, []);
  const attempts = loginAttempts.get(ip).filter(t => now - t < windowMs);
  attempts.push(now);
  loginAttempts.set(ip, attempts);

  return attempts.length > 5;
}

// ─── Expired token tracker ──────────────────────────────────────────────────
async function checkExpiredTokenUsage(ip, payload, sourceIp, pool) {
  // Extract bearer token from Authorization header (passed in payload)
  const bearerMatch = payload.match(/Bearer\s+([^\s"']+)/i);
  if (!bearerMatch) return null;

  const token = bearerMatch[1];
  try {
    // Check if this token exists in honeytokens and is expired
    const result = await pool.query(
      `SELECT id, expires_at, status, type FROM honeytokens 
       WHERE (value::text ILIKE '%' || $1 || '%' OR id::text = $1)
       AND status IN ('active', 'triggered', 'expired')
       LIMIT 1`,
      [token.slice(0, 50)] // partial match to avoid exact key matching
    ).catch(() => ({ rows: [] }));

    if (result.rows && result.rows.length > 0) {
      const token_record = result.rows[0];
      const now = new Date();
      const expiresAt = new Date(token_record.expires_at);
      const isExpired = now > expiresAt;

      if (isExpired) {
        // Track this expired token reuse
        if (!expiredTokenAttempts.has(ip)) {
          expiredTokenAttempts.set(ip, { count: 0, lastAttempt: now });
        }
        const tracker = expiredTokenAttempts.get(ip);
        tracker.count++;
        tracker.lastAttempt = now;

        // Update honeytokens to mark it as reused after expiry
        await pool.query(
          `UPDATE honeytokens SET expired_use_at = NOW() WHERE id = $1`,
          [token_record.id]
        ).catch(() => {});

        return {
          isExpired: true,
          tokenId: token_record.id,
          tokenType: token_record.type,
          expiryTime: expiresAt.toISOString(),
          expiredSeconds: Math.floor((now - expiresAt) / 1000)
        };
      }
    }
  } catch (err) {
    // Silently fail - don't crash the middleware
  }

  return null;
}

// ─── Session sequence counter ────────────────────────────────────────────────
const sessionCounters = new Map();
function getNextSeq(sessionId) {
  const n = (sessionCounters.get(sessionId) || 0) + 1;
  sessionCounters.set(sessionId, n);
  return n;
}

// ─── Middleware ──────────────────────────────────────────────────────────────
function attackLogger(req, res, next) {
  // Always call next immediately — never block
  next();

  // Async logging — fire and forget
  setImmediate(async () => {
    try {
      const sourceIp = (req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim();
      const sourcePort = req.socket?.remotePort || 0;
      const method = req.method;
      const path = req.path;
      const userAgent = req.headers['user-agent'] || '';

      // Session ID: read from cookie, or generate + set
      let sessionId = req.cookies?.sid;
      if (!sessionId) {
        sessionId = require('crypto').randomUUID();
        // Can't set cookie here since headers are already sent, so just use it
      }

      const attemptedUsername = req.body?.username || null;
      const attemptedAccount = req.body?.account || req.query?.account || null;

      // Build payload string
      const payload = JSON.stringify({ query: req.query, body: req.body });

      // Check for expired token reuse
      const expiredTokenInfo = await checkExpiredTokenUsage(sourceIp, payload, sourceIp, pool);

      // Brute force check first
      let classification;
      if (expiredTokenInfo) {
        // Expired token reuse detected
        classification = {
          attack_type: 'expired_token_reuse',
          sub_attack_type: 'honeytoken_reuse',
          severity: 8, // HIGH
          expiredTokenInfo
        };
      } else if (checkBruteForce(sourceIp, path, method)) {
        classification = { attack_type: 'bruteforce', sub_attack_type: 'credential', severity: 6 }; // MEDIUM
      } else {
        classification = classifyAttack(payload, path, method);
      }

      const { attack_type, sub_attack_type, severity } = classification;

      // 1. Insert into attack_logs
      await pool.query(
        `INSERT INTO attack_logs
           (source_ip, source_port, method, path, payload, attack_type, severity,
            user_agent, tool_detected, os_fingerprint, session_id, response_code, timestamp)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())`,
        [
          sourceIp, sourcePort, method, path, payload,
          attack_type, severity,
          userAgent, null, null, // tool and os filled async below
          sessionId,
          res.statusCode || 200
        ]
      ).catch(err => console.error('[Logger] attack_logs insert:', err.message));

      // 2. Upsert attacker_profiles
      const sqliInc = attack_type === 'sqli' ? 1 : 0;
      const xssInc = attack_type === 'xss' ? 1 : 0;
      const bruteInc = attack_type === 'bruteforce' ? 1 : 0;
      const traversalInc = attack_type === 'traversal' ? 1 : 0;

      // Compute threat score delta based on integer severity (1-10)
      let delta = 0;
      if (severity >= 9) delta = 20;       // CRITICAL
      else if (severity >= 7) delta = 10;  // HIGH
      else if (severity >= 4) delta = 5;   // MEDIUM
      else delta = 1;                      // LOW

      await pool.query(
        `INSERT INTO attacker_profiles
           (ip, first_seen, last_seen, total_requests, threat_score,
            sqli_count, xss_count, bruteforce_count, traversal_count,
            country, city, os, tool, is_known_malicious)
         VALUES ($1, NOW(), NOW(), 1, $2, $3, $4, $5, $6, 'Unknown', 'Unknown', NULL, NULL, FALSE)
         ON CONFLICT (ip) DO UPDATE SET
           last_seen = NOW(),
           total_requests = attacker_profiles.total_requests + 1,
           threat_score = LEAST(attacker_profiles.threat_score + $2, 100),
           sqli_count = attacker_profiles.sqli_count + $3,
           xss_count = attacker_profiles.xss_count + $4,
           bruteforce_count = attacker_profiles.bruteforce_count + $5,
           traversal_count = attacker_profiles.traversal_count + $6`,
        [sourceIp, delta, sqliInc, xssInc, bruteInc, traversalInc]
      ).catch(err => console.error('[Logger] attacker_profiles upsert:', err.message));

      // 3. Insert into session_replays
      const seqNum = getNextSeq(sessionId);
      await pool.query(
        `INSERT INTO session_replays (session_id, ip, actions, created_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (session_id) DO UPDATE
           SET actions = (session_replays.actions::jsonb || $3::jsonb)::text`,
        [
          sessionId,
          sourceIp,
          JSON.stringify([{
            seq: seqNum,
            timestamp: new Date().toISOString(),
            method,
            path,
            payload: payload.slice(0, 500)
          }])
        ]
      ).catch(err => console.error('[Logger] session_replays insert:', err.message));

      // 4. Async GeoIP + fingerprint enrichment
      geoip.enrich(sourceIp).catch(() => {});
      
      const { os, tool } = fingerprint.detect(userAgent);
      if (os || tool) {
        fingerprint.updateProfile(sourceIp, os, tool)
          .catch(() => {});
        // Also update tool_detected + os_fingerprint in latest attack_log row
        pool.query(
          `UPDATE attack_logs SET tool_detected = $2, os_fingerprint = $3
           WHERE source_ip = $1 ORDER BY timestamp DESC LIMIT 1`,
          [sourceIp, tool, os]
        ).catch(() => {});
      }

      // 5. AbuseIPDB check (rate limited — only for non-local IPs)
      const isLocal = sourceIp === '127.0.0.1' || sourceIp === '::1' || sourceIp.startsWith('192.168') || sourceIp.startsWith('10.');
      if (!isLocal && process.env.ABUSEIPDB_API_KEY) {
        abuseipdb.check(sourceIp).catch(() => {});
      }

    } catch (err) {
      console.error('[Logger] Unhandled error:', err.message);
    }
  });
}

module.exports = attackLogger;
