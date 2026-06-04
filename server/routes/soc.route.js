const express = require("express");
const router = express.Router();
const pool = require("../db/connection");
const { logSessionAction } = require("../db/logger");

// 1. Get Live Event Feed
router.get("/events", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, timestamp, source_ip, method, path, payload, attack_type, severity, tool_detected, os_fingerprint, session_id, response_code FROM attack_logs ORDER BY timestamp DESC LIMIT 100",
    );
    res.json({ events: result.rows });
  } catch (err) {
    console.error("Error fetching SOC events:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// 2. Get Aggregated SOC Stats & Attackers Leaderboard
router.get("/stats", async (req, res) => {
  try {
    // Attack type distribution
    const statsResult = await pool.query(
      "SELECT attack_type, COUNT(*) as count FROM attack_logs GROUP BY attack_type",
    );

    // Total attacks count
    const totalResult = await pool.query(
      "SELECT COUNT(*) as total FROM attack_logs",
    );

    // Top attackers leaderboard ranked by threat score and requests
    const leaderboardResult = await pool.query(
      `SELECT ip, country, city, isp, os, tool, threat_score, total_requests, is_known_malicious, 
              sqli_count, xss_count, bruteforce_count, traversal_count, first_seen, last_seen
       FROM attacker_profiles 
       ORDER BY threat_score DESC, total_requests DESC 
       LIMIT 10`,
    );

    res.json({
      attacks_by_type: statsResult.rows,
      total_attacks: parseInt(totalResult.rows[0]?.total || 0),
      attackers: leaderboardResult.rows,
    });
  } catch (err) {
    console.error("Error fetching SOC stats:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// 3. Post recorded session actions (Feature 2: Session Replay logging)
router.post("/replay", async (req, res) => {
  const { sessionId, action, actions } = req.body;
  const ip = req.ip || "127.0.0.1";

  if (!sessionId) {
    return res.status(400).json({ error: "Missing parameters" });
  }

  try {
    if (actions && Array.isArray(actions)) {
      for (const act of actions) {
        await logSessionAction(ip, sessionId, act);
      }
    } else if (action) {
      await logSessionAction(ip, sessionId, action);
    } else {
      return res.status(400).json({ error: "Missing action or actions" });
    }
    res.json({ success: true });
  } catch (err) {
    console.error("Replay logging error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// 4. Retrieve session replay logs by session ID (Feature 2: Session Replay playback)
router.get("/replay/:session_id", async (req, res) => {
  const sessionId = req.params.session_id;

  try {
    const result = await pool.query(
      `SELECT session_id, attacker_ip, request_method, request_path, request_body, response_code, timestamp, sequence_number
       FROM session_recordings 
       WHERE session_id = $1
       ORDER BY sequence_number ASC`,
      [sessionId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Session replay not found" });
    }

    res.json({
      session_id: sessionId,
      ip: result.rows[0].attacker_ip,
      recordings: result.rows,
    });
  } catch (err) {
    console.error("Replay fetch error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// 5. Generate CERT Incident Report data (Feature 6: Automated CERT Report)
router.get("/report/:ip", async (req, res) => {
  const attackerIp = req.params.ip;

  try {
    // A. Fetch attacker profile
    const profileRes = await pool.query(
      "SELECT * FROM attacker_profiles WHERE ip = $1",
      [attackerIp],
    );

    if (profileRes.rows.length === 0) {
      return res.status(404).json({ error: "No profile found for this IP" });
    }

    const profile = profileRes.rows[0];

    // B. Fetch attack timeline
    const timelineRes = await pool.query(
      `SELECT timestamp, method, path, payload, attack_type, severity, tool_detected, response_code
       FROM attack_logs
       WHERE source_ip = $1
       ORDER BY timestamp ASC`,
      [attackerIp],
    );
    const timeline = timelineRes.rows;

    // C. Perform risk assessment & recommended actions
    const totalRequests = parseInt(profile.total_requests);
    const threatScore = parseInt(profile.threat_score);
    let riskLevel = "LOW";
    let riskSummary = "Observational reconnaissance with low impact.";
    let actions = [
      "Monitor future requests from this IP.",
      "Log traffic in the WAF system.",
    ];

    if (threatScore > 75) {
      riskLevel = "CRITICAL";
      riskSummary =
        "High frequency exploits detected, including SQL Injection or Path Traversal. Attempted systems takeover.";
      actions = [
        "Block the IP address immediately using host firewalls (e.g. iptables/AWS security group).",
        "Inspect server file systems and database queries for unauthorized command execution.",
        "Reset user session cookies and inspect comments table for stored XSS payloads.",
        "Escalate incident report to national security authorities.",
      ];
    } else if (threatScore > 40) {
      riskLevel = "HIGH";
      riskSummary =
        "Multiple vulnerability scans (SQLi, XSS) targeting application portals.";
      actions = [
        "Rate limit connection requests from this source IP.",
        "Perform database sanitisation on comments.",
        "Analyze logs for successful authentication bypass.",
      ];
    } else if (threatScore > 20) {
      riskLevel = "MEDIUM";
      riskSummary =
        "Failed authentication attempts and probe scanning detected.";
      actions = [
        "Increase log sensitivity for the IP range.",
        "Audit weak authentication settings.",
      ];
    }

    // D. Build Indicator of Compromise (IOC) object
    const iocList = {
      indicator_type: "ipv4-addr",
      value: attackerIp,
      threat_score: threatScore,
      first_seen: profile.first_seen,
      last_seen: profile.last_seen,
      detected_scanners:
        profile.tool !== "Manual (Browser)" ? [profile.tool] : [],
      attack_signatures: [
        profile.sqli_count > 0 ? "SQLi" : null,
        profile.xss_count > 0 ? "XSS" : null,
        profile.traversal_count > 0 ? "Path Traversal" : null,
        profile.bruteforce_count > 0 ? "BruteForce" : null,
      ].filter(Boolean),
    };

    // Return the incident report JSON model
    res.json({
      incident_ref: `CERT-INC-${Date.now().toString().slice(-6)}`,
      report_date: new Date().toISOString(),
      classification: "Academic — Restricted",
      attacker: profile,
      timeline: timeline,
      risk_assessment: {
        risk_level: riskLevel,
        threat_score: threatScore,
        summary: riskSummary,
        recommended_actions: actions,
      },
      ioc: iocList,
    });
  } catch (err) {
    console.error("Error generating CERT report:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
