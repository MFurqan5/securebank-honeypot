async function logAttack(req, { attackType, severity, payload, responseCode }) {
  let client;
  try {
    console.log(`[LOGGER] Starting to log attack: ${attackType}, severity: ${severity}`);
    
    // FIX: Proper IP handling for IPv6
    let rawIp = req.ip || req.socket.remoteAddress || "127.0.0.1";
    
    // Remove IPv6 prefix if present
    let cleanIp = rawIp.replace(/^::ffff:/, '');
    
    // Map IPv6 loopback to IPv4
    if (cleanIp === '::1' || cleanIp === '::' || cleanIp === '0:0:0:0:0:0:0:1') {
      cleanIp = '127.0.0.1';
    }
    
    console.log(`[LOGGER] Original IP: ${rawIp}, Cleaned IP: ${cleanIp}`);
    
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
    
    console.log(`[LOGGER] Executing insert query for IP: ${cleanIp}`);
    const logResult = await pool.query(insertLogQuery, [
      cleanIp,  // Use cleaned IP
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

    // Check if attacker profile exists
    const profileQuery = `SELECT * FROM attacker_profiles WHERE ip = $1`;
    const profileRes = await pool.query(profileQuery, [cleanIp]);
    
    console.log(`[LOGGER] Profile exists for ${cleanIp}: ${profileRes.rows.length > 0}`);

    // Geolocation mapping for local IPs
    let country = "Local Network";
    let city = "Localhost";
    let isp = "Private Range";
    let latitude = null;
    let longitude = null;

    // Check if IP is local or private (updated for IPv6)
    const isPrivateIP = (
      cleanIp === "127.0.0.1" ||
      cleanIp === "localhost" ||
      cleanIp.startsWith("192.168") ||
      cleanIp.startsWith("10.") ||
      cleanIp.startsWith("172.") ||
      cleanIp.startsWith("169.254")
    );
    
    if (isPrivateIP || cleanIp === '127.0.0.1') {
      // Use a deterministic mock location based on IP hash
      const hash = cleanIp.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
      const idx = Math.abs(hash) % mockGeoIPLocations.length;
      const loc = mockGeoIPLocations[idx];
      country = loc.country;
      city = loc.city;
      isp = loc.isp;
      latitude = loc.lat;
      longitude = loc.lon;
      console.log(`[LOGGER] Using mock location for ${cleanIp}: ${country}, ${city}`);
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
      console.log(`[LOGGER] Creating new profile for ${cleanIp} with score: ${newScore}`);
      
      const insertProfileQuery = `
        INSERT INTO attacker_profiles (
          ip, first_seen, last_seen, total_requests, threat_score, 
          country, city, isp, os, tool, is_known_malicious,
          sqli_count, xss_count, bruteforce_count, traversal_count,
          latitude, longitude
        ) VALUES ($1, NOW(), NOW(), 1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      `;
      
      await pool.query(insertProfileQuery, [
        cleanIp,
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
      console.log(`[LOGGER] ✅ New profile created for ${cleanIp}`);
    } else {
      // Update existing profile
      const profile = profileRes.rows[0];
      const newTotal = (profile.total_requests || 0) + 1;

      let sqli = (profile.sqli_count || 0) + (attackType === "sqli" ? 1 : 0);
      let xss = (profile.xss_count || 0) + (attackType === "xss" ? 1 : 0);
      let brute = (profile.bruteforce_count || 0) + (attackType === "bruteforce" ? 1 : 0);
      let traversal = (profile.traversal_count || 0) + (attackType === "traversal" ? 1 : 0);

      // Threat score recalculation
      let uniqueTypes = 0;
      if (sqli > 0) uniqueTypes++;
      if (xss > 0) uniqueTypes++;
      if (brute > 0) uniqueTypes++;
      if (traversal > 0) uniqueTypes++;

      let baseScore = (sqli * 20) + (xss * 15) + (traversal * 20) + (brute * 10);
      let multiplier = uniqueTypes > 1 ? 1.5 : 1.0;
      let finalScore = Math.min(Math.round(baseScore * multiplier), 100);
      
      console.log(`[LOGGER] Updating profile for ${cleanIp}: newScore=${finalScore}, totalRequests=${newTotal}`);

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
            longitude = COALESCE($15, longitude),
            last_updated = NOW()
        WHERE ip = $1
      `;
      
      await pool.query(updateProfileQuery, [
        cleanIp,
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
      console.log(`[LOGGER] ✅ Profile updated for ${cleanIp}`);
    }

    console.log(`🛡️ Attack logged: [${attackType.toUpperCase()}] from ${cleanIp} - Score updated`);
    return logResult.rows[0].id;
  } catch (error) {
    console.error("[LOGGER ERROR] Error logging attack to DB:", error);
    console.error("[LOGGER ERROR] Attack type:", attackType);
    console.error("[LOGGER ERROR] Severity:", severity);
    console.error("[LOGGER ERROR] Error details:", error.message);
    if (error.stack) {
      console.error("[LOGGER ERROR] Stack trace:", error.stack);
    }
    return null;
  }
}