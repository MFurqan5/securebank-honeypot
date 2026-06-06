const pool = require('../db/connection');
const { logAttack } = require('../db/logger');

// Severity mapping
const severityMap = {
  LOW: 3,
  MEDIUM: 5,
  HIGH: 7,
  CRITICAL: 9
};

class AlertEngine {
  constructor() {
    this.pollingInterval = null;
    this.lastProcessedId = 0;
    this.isRunning = false;
  }

  // Start polling for new attacks
  startPolling(intervalMs = 10000) {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }
    
    console.log('[AlertEngine] Starting polling every', intervalMs, 'ms');
    
    // Initial load of last processed ID
    this.loadLastProcessedId();
    
    this.pollingInterval = setInterval(() => {
      this.checkForNewAttacks();
    }, intervalMs);
  }

  async loadLastProcessedId() {
    try {
      const result = await pool.query(`
        SELECT MAX(id) as last_id FROM attack_logs
      `);
      this.lastProcessedId = parseInt(result.rows[0]?.last_id) || 0;
      console.log('[AlertEngine] Last processed ID:', this.lastProcessedId);
    } catch (err) {
      console.error('[AlertEngine] Error loading last processed ID:', err.message);
    }
  }

  async checkForNewAttacks() {
    if (this.isRunning) return;
    this.isRunning = true;

    try {
      // FIX: Removed 'country' column - it doesn't exist in attack_logs table
      const result = await pool.query(`
        SELECT 
          id, 
          source_ip, 
          attack_type, 
          severity,
          severity_label,
          payload, 
          timestamp,
          method,
          path,
          tool_detected,
          response_code
        FROM attack_logs 
        WHERE id > $1 
        ORDER BY id ASC 
        LIMIT 50
      `, [this.lastProcessedId]);

      if (result.rows.length > 0) {
        console.log(`[AlertEngine] Found ${result.rows.length} new attacks`);
        
        for (const attack of result.rows) {
          await this.processAttack(attack);
          this.lastProcessedId = attack.id;
        }
      }
    } catch (err) {
      console.error('[AlertEngine] Poll error:', err.message);
    } finally {
      this.isRunning = false;
    }
  }

  async processAttack(attack) {
    try {
      // Log to console with colors
      const severityColor = this.getSeverityColor(attack.severity);
      console.log(`\n${'='.repeat(60)}`);
      console.log(`🚨 [ALERT] ${attack.attack_type?.toUpperCase() || 'UNKNOWN'} ATTACK DETECTED`);
      console.log(`${'='.repeat(60)}`);
      console.log(`📍 Source IP:    ${attack.source_ip}`);
      console.log(`⚠️  Severity:     ${attack.severity_label || this.getSeverityLabel(attack.severity)} (${attack.severity}/10)`);
      console.log(`🔧 Tool:         ${attack.tool_detected || 'Unknown'}`);
      console.log(`📝 Payload:      ${attack.payload?.substring(0, 200)}${attack.payload?.length > 200 ? '...' : ''}`);
      console.log(`📅 Time:         ${new Date(attack.timestamp).toLocaleString()}`);
      console.log(`${'='.repeat(60)}\n`);

      // Send to connected Socket.io clients (SOC Dashboard)
      const io = require('../server').io;
      if (io) {
        io.emit('new_attack', { events: [attack] });
      }

      // Check for critical severity attacks
      if (attack.severity >= 7) { // HIGH or CRITICAL
        await this.sendHighPriorityAlert(attack);
      }

      // Check for specific attack patterns
      await this.checkAttackPatterns(attack);

    } catch (err) {
      console.error('[AlertEngine] Error processing attack:', err.message);
    }
  }

  async sendHighPriorityAlert(attack) {
    // Send to webhook if configured
    const webhookUrl = process.env.ALERT_WEBHOOK_URL;
    if (webhookUrl) {
      try {
        const axios = require('axios');
        await axios.post(webhookUrl, {
          title: `🚨 ${attack.attack_type?.toUpperCase()} Attack`,
          severity: attack.severity_label || this.getSeverityLabel(attack.severity),
          ip: attack.source_ip,
          payload: attack.payload,
          timestamp: attack.timestamp,
          tool: attack.tool_detected
        });
        console.log(`[AlertEngine] Webhook alert sent for ${attack.source_ip}`);
      } catch (err) {
        console.error('[AlertEngine] Webhook error:', err.message);
      }
    }

    // Log to file (optional)
    if (process.env.LOG_ALERTS_TO_FILE === 'true') {
      const fs = require('fs');
      const logEntry = {
        timestamp: new Date().toISOString(),
        type: attack.attack_type,
        severity: attack.severity,
        ip: attack.source_ip,
        payload: attack.payload
      };
      fs.appendFileSync('alerts.log', JSON.stringify(logEntry) + '\n');
    }
  }

  async checkAttackPatterns(attack) {
    // Check for bruteforce patterns
    if (attack.attack_type === 'bruteforce') {
      const count = await this.getRecentAttacksCount(attack.source_ip, 'bruteforce', 300000); // last 5 minutes
      if (count >= 5) {
        console.log(`[AlertEngine] 🔒 Possible bruteforce attack from ${attack.source_ip} (${count} attempts)`);
        
        // Update attacker profile
        await pool.query(`
          UPDATE attacker_profiles 
          SET bruteforce_count = bruteforce_count + 1,
              threat_score = LEAST(threat_score + 10, 100)
          WHERE ip = $1
        `, [attack.source_ip]);
      }
    }

    // Check for SQL injection patterns
    if (attack.attack_type === 'sqli') {
      console.log(`[AlertEngine] 🗄️ SQL Injection detected from ${attack.source_ip}`);
      
      // Update threat score
      await pool.query(`
        UPDATE attacker_profiles 
        SET sqli_count = sqli_count + 1,
            threat_score = LEAST(threat_score + 20, 100)
        WHERE ip = $1
      `, [attack.source_ip]);
    }

    // Check for XSS patterns
    if (attack.attack_type === 'xss') {
      console.log(`[AlertEngine] 💉 XSS attack detected from ${attack.source_ip}`);
      
      await pool.query(`
        UPDATE attacker_profiles 
        SET xss_count = xss_count + 1,
            threat_score = LEAST(threat_score + 15, 100)
        WHERE ip = $1
      `, [attack.source_ip]);
    }

    // Check for path traversal
    if (attack.attack_type === 'traversal') {
      console.log(`[AlertEngine] 📂 Path traversal detected from ${attack.source_ip}`);
      
      await pool.query(`
        UPDATE attacker_profiles 
        SET traversal_count = traversal_count + 1,
            threat_score = LEAST(threat_score + 20, 100)
        WHERE ip = $1
      `, [attack.source_ip]);
    }
  }

  async getRecentAttacksCount(ip, attackType, timeWindowMs) {
    try {
      const result = await pool.query(`
        SELECT COUNT(*) as count
        FROM attack_logs
        WHERE source_ip = $1 
          AND attack_type = $2
          AND timestamp > NOW() - ($3 || ' milliseconds')::INTERVAL
      `, [ip, attackType, timeWindowMs]);
      return parseInt(result.rows[0]?.count) || 0;
    } catch (err) {
      return 0;
    }
  }

  getSeverityLabel(severity) {
    if (severity >= 9) return 'CRITICAL';
    if (severity >= 7) return 'HIGH';
    if (severity >= 4) return 'MEDIUM';
    return 'LOW';
  }

  getSeverityColor(severity) {
    if (severity >= 9) return '\x1b[31m'; // Red
    if (severity >= 7) return '\x1b[33m'; // Yellow
    if (severity >= 4) return '\x1b[36m'; // Cyan
    return '\x1b[32m'; // Green
  }

  stopPolling() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
      console.log('[AlertEngine] Polling stopped');
    }
  }

  // Manual trigger for new attack (called from logAttack)
  async triggerManualAlert(attack) {
    await this.processAttack(attack);
  }
}

// Singleton instance
const alertEngine = new AlertEngine();

module.exports = alertEngine;