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
    return Math.min(Math.max(severity, 1), 10); // Clamp between 1-10
  }
  
  // String mapping
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
  return map[severity] || 5; // Default to MEDIUM
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
  let client;
  try {
    console.log(`[LOGGER] Starting to log attack: ${attackType}, severity: ${severity}`);
    
    const ip = req.ip || req.socket.remoteAddress || "127.0.0.1";
    const port = req.socket.remotePort || 0;
    const method = req.method;
    const path = req.originalUrl || req.path;
    const ua = req.headers["user-agent"] || "";
    const sessionId = req.headers["x-session-id"] || "session_none";

    // Parse tool and OS
    const { tool, os } = parseUserAgent(ua);
    
    // Convert severity to integer
    const severityInt = severityToInteger(severity);
    console.log(`[LOGGER] Converted severity to integer: ${severityInt}`);

    // Save attack log in database
    const insertLogQuery = `
      INSERT INTO attack_logs (
        source_ip, source_port, method, path, payload, 
        attack_type, severity, user_agent, tool_detected, 
        os_fingerprint, session_id, response_code, timestamp
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
      RETURNING id
    `;
    
    console.log(`[LOGGER] Executing insert query for IP: ${ip}`);
    const logResult = await pool.query(insertLogQuery, [
      ip,
      port,
      method,
      path,
      payload || null,
      attackType,
      severityInt,
      ua,
      tool,
      os,
      sessionId,
      responseCode || 200,
    ]);
    
    console.log(`[LOGGER] Attack log inserted with ID: ${logResult.rows[0].id}`);

    // Check if attacker profile exists, if not create, else update
    const profileQuery = `SELECT * FROM attacker_profiles WHERE ip = $1`;
    const profileRes = await pool.query(profileQuery, [ip]);

    // Geolocation mapping
    let country = "Local LAN";
    let city = "Local Network";
    let isp = "Private Range";
    let latitude = null;
    let longitude = null;

    // Check if IP is local or private
    const isPrivateIP = (
      ip === "127.0.0.1" ||
      ip === "::1" ||
      ip.startsWith("192.168") ||
      ip.startsWith("10.") ||
      ip.startsWith("172.") ||
      ip.startsWith("::ffff:")
    );
    
    if (isPrivateIP) {
      // Use hash of IP to select a stable mock location
      const hash = ip.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
      const idx = Math.abs(hash) % mockGeoIPLocations.length;
      const loc = mockGeoIPLocations[idx];
      country = loc.country;
      city = loc.city;
      isp = loc.isp;
      latitude = loc.lat;
      longitude = loc.lon;
      console.log(`[LOGGER] Using mock location for ${ip}: ${country}, ${city}`);
    }

    // Determine threat points based on attack type
    let points = 0;
    if (attackType === "sqli") points += 20;
    else if (attackType === "xss") points += 15;
    else if (attackType === "traversal") points += 20;
    else if (attackType === "bruteforce") points += 10;
    else if (attackType === "idor") points += 15;
    else if (attackType === "csrf") points += 10;

    // Add severity points
    if (severityInt >= 9) points += 20;
    else if (severityInt >= 7) points += 10;
    else if (severityInt >= 4) points += 5;

    console.log(`[LOGGER] Threat points calculated: ${points}`);

    if (profileRes.rows.length === 0) {
      // Create new profile
      const newScore = Math.min(points, 100);
      console.log(`[LOGGER] Creating new profile for ${ip} with score: ${newScore}`);
      
      const insertProfileQuery = `
        INSERT INTO attacker_profiles (
          ip, first_seen, last_seen, total_requests, threat_score, 
          country, city, isp, os, tool, is_known_malicious,
          sqli_count, xss_count, bruteforce_count, traversal_count,
          latitude, longitude
        ) VALUES ($1, NOW(), NOW(), 1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
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
        attackType === "sqli" ? 1 : 0,
        attackType === "xss" ? 1 : 0,
        attackType === "bruteforce" ? 1 : 0,
        attackType === "traversal" ? 1 : 0,
        latitude,
        longitude
      ]);
      console.log(`[LOGGER] New profile created for ${ip}`);
    } else {
      // Update existing profile
      const profile = profileRes.rows[0];
      const newTotal = profile.total_requests + 1;

      let sqli = profile.sqli_count + (attackType === "sqli" ? 1 : 0);
      let xss = profile.xss_count + (attackType === "xss" ? 1 : 0);
      let brute = profile.bruteforce_count + (attackType === "bruteforce" ? 1 : 0);
      let traversal = profile.traversal_count + (attackType === "traversal" ? 1 : 0);

      // Threat score recalculation with variety multiplier
      let uniqueTypes = 0;
      if (sqli > 0) uniqueTypes++;
      if (xss > 0) uniqueTypes++;
      if (brute > 0) uniqueTypes++;
      if (traversal > 0) uniqueTypes++;

      let baseScore = (sqli * 20) + (xss * 15) + (traversal * 20) + (brute * 10);
      let multiplier = uniqueTypes > 1 ? 1.5 : 1.0;
      let finalScore = Math.min(Math.round(baseScore * multiplier), 100);
      
      console.log(`[LOGGER] Updating profile for ${ip}: newScore=${finalScore}, totalRequests=${newTotal}`);

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
            traversal_count = $10,
            country = COALESCE($11, country),
            city = COALESCE($12, city),
            isp = COALESCE($13, isp),
            latitude = COALESCE($14, latitude),
            longitude = COALESCE($15, longitude)
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
        traversal,
        country,
        city,
        isp,
        latitude,
        longitude
      ]);
      console.log(`[LOGGER] Profile updated for ${ip}`);
    }

    console.log(`🛡️ Attack logged: [${attackType.toUpperCase()}] from ${ip} - Score updated`);
    return logResult.rows[0].id;
  } catch (error) {
    console.error("[LOGGER ERROR] Error logging attack to DB:", error);
    console.error("[LOGGER ERROR] Attack type:", attackType);
    console.error("[LOGGER ERROR] Severity:", severity);
    console.error("[LOGGER ERROR] Error details:", error.message);
    // Don't throw the error, just return null to not break the main flow
    return null;
  }
}

// Log session events (Replay data)
async function logSessionAction(ip, sessionId, action) {
  try {
    console.log(`[SESSION LOGGER] Logging action for IP: ${ip}, Session: ${sessionId}`);
    
    const seqNum = Math.floor(Math.random() * 10000) + 1;

    const query = `
      INSERT INTO session_recordings (
        session_id, attacker_ip, request_method, request_path, 
        request_body, response_code, timestamp, sequence_number
      )
      VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7)
    `;

    const method = action.type || "LOG";
    const path = action.page || action.target || "";
    const body = JSON.stringify(action);

    await pool.query(query, [sessionId, ip, method, path, body, 200, seqNum]);
    console.log(`[SESSION LOGGER] Session action logged successfully`);
  } catch (error) {
    console.error("[SESSION LOGGER ERROR] Error logging session replay action:", error);
  }
}

module.exports = {
  logAttack,
  logSessionAction,
  mockGeoIPLocations,
};