const pool = require("./connection");

// Mock data list for local testing geolocation
const mockGeoIPLocations = [
  {
    country: "United States",
    city: "Washington",
    isp: "Comcast",
    lat: 38.89511,
    lon: -77.03637,
  },
  {
    country: "Pakistan",
    city: "Lahore",
    isp: "PTCL",
    lat: 31.54972,
    lon: 74.34361,
  },
  {
    country: "Germany",
    city: "Berlin",
    isp: "Deutsche Telekom",
    lat: 52.52,
    lon: 13.40495,
  },
  {
    country: "China",
    city: "Beijing",
    isp: "China Telecom",
    lat: 39.9042,
    lon: 116.40739,
  },
  {
    country: "United Kingdom",
    city: "London",
    isp: "British Telecom",
    lat: 51.50735,
    lon: -0.12776,
  },
  {
    country: "Russia",
    city: "Moscow",
    isp: "Rostelecom",
    lat: 55.75582,
    lon: 37.6173,
  },
  {
    country: "Australia",
    city: "Sydney",
    isp: "Telstra",
    lat: -33.86882,
    lon: 151.20929,
  },
];

// Severity to integer mapping (1-10)
function severityToInteger(severity) {
  if (typeof severity === 'number') {
    return Math.min(Math.max(severity, 1), 10);
  }
  
  const map = {
    'LOW': 3,
    'MEDIUM': 5,
    'HIGH': 7,
    'CRITICAL': 9,
    'low': 3,
    'medium': 5,
    'high': 7,
    'critical': 9
  };
  return map[severity] || 5;
}

// Helper to parse OS and Tool from User Agent
function parseUserAgent(ua = "") {
  let tool = "Manual (Browser)";
  let os = "Unknown OS";

  const uaLower = ua.toLowerCase();

  // Detect Tools
  if (uaLower.includes("sqlmap")) {
    tool = "SQLMap";
  } else if (uaLower.includes("nikto")) {
    tool = "Nikto";
  } else if (uaLower.includes("dirbuster") || uaLower.includes("dirb")) {
    tool = "DirBuster";
  } else if (uaLower.includes("nmap")) {
    tool = "Nmap";
  } else if (uaLower.includes("burpsuite") || uaLower.includes("burp")) {
    tool = "Burp Suite";
  } else if (uaLower.includes("hydra")) {
    tool = "Hydra";
  } else if (uaLower.includes("curl")) {
    tool = "Curl";
  } else if (uaLower.includes("postman")) {
    tool = "Postman";
  }

  // Detect OS
  if (uaLower.includes("windows")) {
    os = "Windows";
  } else if (uaLower.includes("macintosh") || uaLower.includes("mac os")) {
    os = "macOS";
  } else if (uaLower.includes("linux")) {
    os = "Linux";
  } else if (uaLower.includes("iphone") || uaLower.includes("ipad")) {
    os = "iOS";
  } else if (uaLower.includes("android")) {
    os = "Android";
  }

  return { tool, os };
}

// Log attack event in PostgreSQL database
async function logAttack(req, { attackType, severity, payload, responseCode }) {
  try {
    console.log(`[LOGGER] Starting to log attack: ${attackType}, severity: ${severity}`);
    
    let rawIp = req.ip || req.socket.remoteAddress || "127.0.0.1";
    
    // Clean IP address
    let cleanIp = rawIp.replace(/^::ffff:/, '');
    if (cleanIp === '::1' || cleanIp === '::' || cleanIp === '0:0:0:0:0:0:0:1') {
      cleanIp = '127.0.0.1';
    }
    
    console.log(`[LOGGER] Cleaned IP: ${cleanIp}`);
    
    const port = req.socket.remotePort || 0;
    const method = req.method;
    const path = req.originalUrl || req.path;
    const ua = req.headers["user-agent"] || "";
    const sessionId = req.headers["x-session-id"] || "session_none";

    const { tool, os } = parseUserAgent(ua);
    const severityInt = severityToInteger(severity);

    // Save attack log
    const insertLogQuery = `
      INSERT INTO attack_logs (
        source_ip, source_port, method, path, payload, 
        attack_type, severity, user_agent, tool_detected, 
        os_fingerprint, session_id, response_code, timestamp
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
      RETURNING id
    `;
    
    const logResult = await pool.query(insertLogQuery, [
      cleanIp, port, method, path, payload || null,
      attackType, severityInt, ua, tool, os, sessionId, responseCode || 200,
    ]);
    
    console.log(`[LOGGER] Attack log inserted with ID: ${logResult.rows[0].id}`);

    // Update attacker profile
    const profileRes = await pool.query(`SELECT * FROM attacker_profiles WHERE ip = $1`, [cleanIp]);
    
    // Geolocation
    let country = "Unknown", city = "Unknown", isp = "Unknown";
    let latitude = null, longitude = null;
    
    const isPrivateIP = (
      cleanIp === "127.0.0.1" ||
      cleanIp.startsWith("192.168") ||
      cleanIp.startsWith("10.") ||
      cleanIp.startsWith("172.")
    );
    
    if (isPrivateIP) {
      const hash = cleanIp.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
      const idx = Math.abs(hash) % mockGeoIPLocations.length;
      const loc = mockGeoIPLocations[idx];
      country = loc.country;
      city = loc.city;
      isp = loc.isp;
      latitude = loc.lat;
      longitude = loc.lon;
    }

    // Calculate threat points
    let points = 0;
    if (attackType === "sqli") points += 20;
    else if (attackType === "xss") points += 15;
    else if (attackType === "traversal") points += 20;
    else if (attackType === "bruteforce") points += 10;
    
    if (severityInt >= 9) points += 20;
    else if (severityInt >= 7) points += 10;
    else if (severityInt >= 4) points += 5;

    if (profileRes.rows.length === 0) {
      const newScore = Math.min(points, 100);
      await pool.query(`
        INSERT INTO attacker_profiles (
          ip, first_seen, last_seen, total_requests, threat_score, 
          country, city, isp, os, tool, is_known_malicious,
          sqli_count, xss_count, bruteforce_count, traversal_count
        ) VALUES ($1, NOW(), NOW(), 1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      `, [cleanIp, newScore, country, city, isp, os, tool, newScore > 75,
          attackType === "sqli" ? 1 : 0,
          attackType === "xss" ? 1 : 0,
          attackType === "bruteforce" ? 1 : 0,
          attackType === "traversal" ? 1 : 0]);
      console.log(`[LOGGER] New profile created for ${cleanIp}`);
    } else {
      const profile = profileRes.rows[0];
      const newTotal = profile.total_requests + 1;
      let sqli = profile.sqli_count + (attackType === "sqli" ? 1 : 0);
      let xss = profile.xss_count + (attackType === "xss" ? 1 : 0);
      let brute = profile.bruteforce_count + (attackType === "bruteforce" ? 1 : 0);
      let traversal = profile.traversal_count + (attackType === "traversal" ? 1 : 0);
      
      let uniqueTypes = (sqli > 0 ? 1 : 0) + (xss > 0 ? 1 : 0) + (brute > 0 ? 1 : 0) + (traversal > 0 ? 1 : 0);
      let baseScore = (sqli * 20) + (xss * 15) + (traversal * 20) + (brute * 10);
      let finalScore = Math.min(Math.round(baseScore * (uniqueTypes > 1 ? 1.5 : 1.0)), 100);
      
      await pool.query(`
        UPDATE attacker_profiles
        SET last_seen = NOW(), total_requests = $2, threat_score = $3,
            os = $4, tool = $5, is_known_malicious = $6,
            sqli_count = $7, xss_count = $8, bruteforce_count = $9, traversal_count = $10
        WHERE ip = $1
      `, [cleanIp, newTotal, finalScore, os, tool, finalScore > 75, sqli, xss, brute, traversal]);
      console.log(`[LOGGER] Profile updated for ${cleanIp}`);
    }

    return logResult.rows[0].id;
  } catch (error) {
    console.error("[LOGGER ERROR]", error);
    return null;
  }
}

// FIXED: Log session events function
async function logSessionAction(ip, sessionId, action) {
  try {
    console.log(`[SESSION LOGGER] Logging action for IP: ${ip}, Session: ${sessionId}`);
    
    // Clean IP
    let cleanIp = ip ? ip.replace(/^::ffff:/, '') : 'unknown';
    if (cleanIp === '::1') cleanIp = '127.0.0.1';
    
    const seqNum = Math.floor(Math.random() * 10000) + 1;
    const method = action.type || "LOG";
    const path = action.page || action.target || "";
    const body = JSON.stringify(action);

    const query = `
      INSERT INTO session_recordings (
        session_id, attacker_ip, request_method, request_path, 
        request_body, response_code, timestamp, sequence_number
      )
      VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7)
    `;

    await pool.query(query, [sessionId, cleanIp, method, path, body, 200, seqNum]);
    console.log(`[SESSION LOGGER] ✅ Session action logged successfully for ${cleanIp}`);
    return true;
  } catch (error) {
    console.error("[SESSION LOGGER ERROR]", error.message);
    return false;
  }
}

// Helper function to get attacker profile by IP
async function getAttackerProfile(ip) {
  try {
    let cleanIp = ip ? ip.replace(/^::ffff:/, '') : '';
    if (cleanIp === '::1') cleanIp = '127.0.0.1';
    const result = await pool.query('SELECT * FROM attacker_profiles WHERE ip = $1', [cleanIp]);
    return result.rows[0] || null;
  } catch (error) {
    console.error("[GET PROFILE ERROR]", error);
    return null;
  }
}

// ✅ MAKE SURE ALL FUNCTIONS ARE EXPORTED
module.exports = {
  logAttack,
  logSessionAction,   // This must be here
  getAttackerProfile,
  mockGeoIPLocations
};