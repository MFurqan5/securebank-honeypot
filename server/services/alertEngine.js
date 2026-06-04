const axios = require('axios');
const nodemailer = require('nodemailer');
const { exec } = require('child_process');
const pool = require('../db/pool');

// ─── Email transporter ─────────────────────────────────────────────────────
let transporter = null;
function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return transporter;
}

// ─── Telegram ──────────────────────────────────────────────────────────────
async function sendTelegram(text) {
  if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) return;
  try {
    await axios.post(
      `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        chat_id: process.env.TELEGRAM_CHAT_ID,
        text,
        parse_mode: 'Markdown',
      },
      { timeout: 5000 }
    );
  } catch (err) {
    console.error('[AlertEngine] Telegram failed:', err.message);
  }
}

// ─── Email ─────────────────────────────────────────────────────────────────
async function sendEmail(subject, html) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return;
  try {
    await getTransporter().sendMail({
      from: process.env.SMTP_USER,
      to: process.env.ALERT_EMAIL_TO || process.env.SMTP_USER,
      subject,
      html,
    });
  } catch (err) {
    console.error('[AlertEngine] Email failed:', err.message);
  }
}

// ─── IP Block (iptables — only works on Linux with root) ────────────────────
function blockIP(ip) {
  exec(`iptables -A INPUT -s ${ip} -j DROP`, (err) => {
    if (err) console.error('[AlertEngine] Block failed (not root?):', err.message);
    else console.log(`[AlertEngine] Blocked IP: ${ip}`);
  });

  // Log to ioc_records
  pool.query(
    `INSERT INTO ioc_records (ip, attack_types, threat_score, blocked_automatically, blocked_at)
     VALUES ($1, 'auto-block', 100, TRUE, NOW())
     ON CONFLICT DO NOTHING`,
    [ip]
  ).catch(() => {});
}

// ─── CRITICAL alert (called directly by honeytoken trigger) ────────────────
async function sendCritical(details) {
  const { ip, country, attack_type, payload, timestamp, honeytokenId } = details;
  const label = 'CRITICAL';
  const safePayload = (payload || '').slice(0, 100);

  const tgText = `🚨 *SECUREBANK SOC ALERT*\nSeverity: ${label}\nIP: ${ip} (${country || 'Unknown'})\nAttack: ${attack_type || 'HONEYTOKEN_TRIGGERED'}\nPayload: ${safePayload}\nTime: ${timestamp || new Date().toISOString()}\nHoneytoken: ${honeytokenId || 'N/A'}`;
  await sendTelegram(tgText);

  const emailHtml = `<h2>🚨 SECUREBANK HONEYTOKEN CRITICAL ALERT</h2>
    <table border="1" cellpadding="5">
      <tr><td><b>IP</b></td><td>${ip}</td></tr>
      <tr><td><b>Country</b></td><td>${country || 'Unknown'}</td></tr>
      <tr><td><b>Attack Type</b></td><td>${attack_type || 'HONEYTOKEN_TRIGGERED'}</td></tr>
      <tr><td><b>Honeytoken ID</b></td><td>${honeytokenId || 'N/A'}</td></tr>
      <tr><td><b>Payload</b></td><td>${safePayload}</td></tr>
      <tr><td><b>Time</b></td><td>${timestamp || new Date().toISOString()}</td></tr>
    </table>`;
  await sendEmail(`[SOC ALERT] CRITICAL — HONEYTOKEN from ${ip}`, emailHtml);
}

// ─── Poll loop ──────────────────────────────────────────────────────────────
let alertedIds = new Set();
let alertedKnownMalicious = new Set();

async function poll() {
  try {
    // Rule 1: severity >= HIGH attacks (using HIGH/CRITICAL severity strings)
    const sevRes = await pool.query(
      `SELECT id, source_ip, country, attack_type, payload, timestamp, severity
       FROM attack_logs
       WHERE severity IN ('HIGH', 'CRITICAL')
         AND id > $1
       ORDER BY id ASC
       LIMIT 20`,
      [Math.max(...[...alertedIds].filter(n => typeof n === 'number'), 0)]
    );

    for (const row of sevRes.rows) {
      if (alertedIds.has(row.id)) continue;
      alertedIds.add(row.id);

      const tgText = `🚨 *SECUREBANK SOC ALERT*\nSeverity: ${row.severity}\nIP: ${row.source_ip} (${row.country || 'Unknown'})\nAttack: ${row.attack_type}\nPayload: ${(row.payload || '').slice(0, 100)}\nTime: ${row.timestamp}`;
      await sendTelegram(tgText);

      const emailHtml = `<h2>SECUREBANK SOC ALERT</h2>
        <p><b>Severity:</b> ${row.severity}</p>
        <p><b>IP:</b> ${row.source_ip}</p>
        <p><b>Attack:</b> ${row.attack_type}</p>
        <p><b>Payload:</b> ${(row.payload || '').slice(0, 200)}</p>
        <p><b>Time:</b> ${row.timestamp}</p>`;
      await sendEmail(`[SOC ALERT] ${row.severity} — ${row.attack_type} from ${row.source_ip}`, emailHtml);
    }

    // Rule 2: Aggressive attackers — >10 requests in last 60 seconds
    const aggressiveRes = await pool.query(
      `SELECT source_ip, COUNT(*) as cnt
       FROM attack_logs
       WHERE timestamp > NOW() - INTERVAL '60 seconds'
       GROUP BY source_ip
       HAVING COUNT(*) > 10`
    );
    for (const row of aggressiveRes.rows) {
      const key = `agg:${row.source_ip}:${Math.floor(Date.now() / 60000)}`;
      if (alertedIds.has(key)) continue;
      alertedIds.add(key);
      await sendTelegram(`⚡ *AGGRESSIVE ATTACKER*\nIP: ${row.source_ip}\nRequests in last 60s: ${row.cnt}\nAction: Rate limit / Block recommended`);
      blockIP(row.source_ip);
    }

    // Rule 3: Known malicious IPs on first appearance
    const maliciousRes = await pool.query(
      `SELECT ip, country, tool, threat_score
       FROM attacker_profiles
       WHERE is_known_malicious = TRUE`
    );
    for (const row of maliciousRes.rows) {
      if (alertedKnownMalicious.has(row.ip)) continue;
      alertedKnownMalicious.add(row.ip);
      await sendTelegram(`🔴 *KNOWN MALICIOUS IP DETECTED*\nIP: ${row.ip} (${row.country || 'Unknown'})\nTool: ${row.tool || 'Unknown'}\nThreat Score: ${row.threat_score}`);
    }

    // Rule 4: High threat score escalation
    const threatRes = await pool.query(
      `SELECT ip, country, threat_score, tool
       FROM attacker_profiles
       WHERE threat_score > 80`
    );
    for (const row of threatRes.rows) {
      const key = `threat:${row.ip}`;
      if (alertedIds.has(key)) continue;
      alertedIds.add(key);
      await sendTelegram(`📈 *HIGH THREAT ESCALATION*\nIP: ${row.ip} (${row.country || 'Unknown'})\nThreat Score: ${row.threat_score}/100\nTool: ${row.tool || 'Unknown'}\nAction: Blocking IP`);
      blockIP(row.ip);
    }

    // Keep alertedIds from growing unboundedly
    if (alertedIds.size > 10000) {
      alertedIds = new Set([...alertedIds].slice(-5000));
    }
  } catch (err) {
    console.error('[AlertEngine] Poll error:', err.message);
  }
}

function startPolling() {
  console.log('[AlertEngine] Starting alert polling every 10s');
  poll(); // run immediately once
  setInterval(poll, 10000);
}

module.exports = { startPolling, sendCritical, sendTelegram, sendEmail, blockIP };
