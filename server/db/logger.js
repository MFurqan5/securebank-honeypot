const pool = require('./connection');

// Mock data list for local testing geolocation
const mockGeoIPLocations = [
  { country: 'United States', city: 'Washington', isp: 'Comcast', lat: 38.89511, lon: -77.03637 },
  { country: 'Pakistan', city: 'Lahore', isp: 'PTCL', lat: 31.54972, lon: 74.34361 },
  { country: 'Germany', city: 'Berlin', isp: 'Deutsche Telekom', lat: 52.52000, lon: 13.40495 },
  { country: 'China', city: 'Beijing', isp: 'China Telecom', lat: 39.90420, lon: 116.40739 },
  { country: 'United Kingdom', city: 'London', isp: 'British Telecom', lat: 51.50735, lon: -0.12776 },
  { country: 'Russia', city: 'Moscow', isp: 'Rostelecom', lat: 55.75582, lon: 37.61730 },
  { country: 'Australia', city: 'Sydney', isp: 'Telstra', lat: -33.86882, lon: 151.20929 }
];

// Helper to parse OS and Tool from User Agent
function parseUserAgent(ua = '') {
  let tool = 'Manual (Browser)';
  let os = 'Unknown OS';

  const uaLower = ua.toLowerCase();

  // Detect Tools
  if (uaLower.includes('sqlmap')) {
    tool = 'SQLMap';
  } else if (uaLower.includes('nikto')) {
    tool = 'Nikto';
  } else if (uaLower.includes('dirbuster') || uaLower.includes('dirb')) {
    tool = 'DirBuster';
  } else if (uaLower.includes('nmap')) {
    tool = 'Nmap';
  } else if (uaLower.includes('burpsuite') || uaLower.includes('burp')) {
    tool = 'Burp Suite';
  } else if (uaLower.includes('hydra')) {
    tool = 'Hydra';
  } else if (uaLower.includes('curl')) {
    tool = 'Curl';
  } else if (uaLower.includes('postman')) {
    tool = 'Postman';
  }

  // Detect OS
  if (uaLower.includes('windows')) {
    os = 'Windows';
  } else if (uaLower.includes('macintosh') || uaLower.includes('mac os')) {
    os = 'macOS';
  } else if (uaLower.includes('linux')) {
    os = 'Linux';
  } else if (uaLower.includes('iphone') || uaLower.includes('ipad')) {
    os = 'iOS';
  } else if (uaLower.includes('android')) {
    os = 'Android';
  }

  return { tool, os };
}

// Log attack event in PostgreSQL database
async function logAttack(req, { attackType, severity, payload, responseCode }) {
  try {
    const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
    const port = req.socket.remotePort || 0;
    const method = req.method;
    const path = req.originalUrl || req.path;
    const ua = req.headers['user-agent'] || '';
    const sessionId = req.headers['x-session-id'] || 'session_none';

    // Parse tool and OS
    const { tool, os } = parseUserAgent(ua);

    // Save attack log in database
    const insertLogQuery = `
      INSERT INTO attack_logs (source_ip, source_port, method, path, payload, attack_type, severity, user_agent, tool_detected, os_fingerprint, session_id, response_code, timestamp)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
      RETURNING id
    `;
    const logResult = await pool.query(insertLogQuery, [
      ip, port, method, path, payload, attackType, severity, ua, tool, os, sessionId, responseCode
    ]);

    // Check if attacker profile exists, if not create, else update
    const profileQuery = `SELECT * FROM attacker_profiles WHERE ip = $1`;
    const profileRes = await pool.query(profileQuery, [ip]);

    // Geolocation mapping: for local IPs, assign a stable mock profile so pins appear on map
    let country = 'Local LAN';
    let city = 'Local Network';
    let isp = 'Private Range';
    
    // Simple hash from IP to select a stable mock location for local testing
    if (ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168') || ip.startsWith('10.') || ip.startsWith('::ffff:')) {
      const idx = Math.abs(ip.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)) % mockGeoIPLocations.length;
      const loc = mockGeoIPLocations[idx];
      country = loc.country;
      city = loc.city;
      isp = loc.isp;
    }

    // Determine threat points
    let points = 0;
    if (attackType === 'sqli') points += 20;
    else if (attackType === 'xss') points += 15;
    else if (attackType === 'traversal') points += 20;
    else if (attackType === 'bruteforce') points += 10;
    
    if (severity === 'CRITICAL') points += 20;
    else if (severity === 'HIGH') points += 10;

    if (profileRes.rows.length === 0) {
      // Create new profile
      const newScore = Math.min(points, 100);
      const insertProfileQuery = `
        INSERT INTO attacker_profiles (
          ip, first_seen, last_seen, total_requests, threat_score, country, city, isp, os, tool, is_known_malicious,
          sqli_count, xss_count, bruteforce_count, traversal_count
        ) VALUES ($1, NOW(), NOW(), 1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      `;
      await pool.query(insertProfileQuery, [
        ip,
        newScore,
        country,
        city,
        isp,
        os,
        tool,
        newScore > 75,
        attackType === 'sqli' ? 1 : 0,
        attackType === 'xss' ? 1 : 0,
        attackType === 'bruteforce' ? 1 : 0,
        attackType === 'traversal' ? 1 : 0
      ]);
    } else {
      // Update existing profile
      const profile = profileRes.rows[0];
      const newTotal = profile.total_requests + 1;
      
      let sqli = profile.sqli_count + (attackType === 'sqli' ? 1 : 0);
      let xss = profile.xss_count + (attackType === 'xss' ? 1 : 0);
      let brute = profile.bruteforce_count + (attackType === 'bruteforce' ? 1 : 0);
      let traversal = profile.traversal_count + (attackType === 'traversal' ? 1 : 0);

      // Threat score recalculation (variety multiplier)
      let uniqueTypes = 0;
      if (sqli > 0) uniqueTypes++;
      if (xss > 0) uniqueTypes++;
      if (brute > 0) uniqueTypes++;
      if (traversal > 0) uniqueTypes++;
      
      let baseScore = (sqli * 20) + (xss * 15) + (traversal * 20) + (brute * 10);
      let multiplier = uniqueTypes > 1 ? 1.5 : 1.0;
      let finalScore = Math.min(Math.round(baseScore * multiplier), 100);

      const updateProfileQuery = `
        UPDATE attacker_profiles
        SET last_seen = NOW(),
            total_requests = $2,
            threat_score = $3,
            os = $4,
            tool = $5,
            is_known_malicious = $6,
            sqli_count = $7,
            xss_count = $8,
            bruteforce_count = $9,
            traversal_count = $10
        WHERE ip = $1
      `;
      await pool.query(updateProfileQuery, [
        ip,
        newTotal,
        finalScore,
        os,
        tool,
        finalScore > 75,
        sqli,
        xss,
        brute,
        traversal
      ]);
    }

    console.log(`🛡️ Attack logged: [${attackType.toUpperCase()}] from ${ip} - Score updated`);
    return logResult.rows[0].id;
  } catch (error) {
    console.error('Error logging attack to DB:', error);
  }
}

// Log session events (Replay data)
async function logSessionAction(ip, sessionId, action) {
  try {
    const actionsList = [action];
    const actionsJsonStr = JSON.stringify(actionsList);
    
    // Perform an atomic insert or update (append to json array) to prevent race conditions
    const query = `
      INSERT INTO session_replays (session_id, ip, actions, created_at)
      VALUES ($1, $2, $3::text, NOW())
      ON CONFLICT (session_id)
      DO UPDATE SET actions = (session_replays.actions::jsonb || $3::jsonb)::text
    `;
    await pool.query(query, [sessionId, ip, actionsJsonStr]);
  } catch (error) {
    console.error('Error logging session replay action:', error);
  }
}

module.exports = {
  logAttack,
  logSessionAction,
  mockGeoIPLocations
};
