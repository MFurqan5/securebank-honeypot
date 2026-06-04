const axios = require('axios');
const pool = require('../db/connection'); // Fixed import

async function check(ip) {
  try {
    // Skip private IPs
    if (ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168') || 
        ip.startsWith('10.') || ip.startsWith('172.')) {
      console.log(`[AbuseIPDB] Skipping private IP: ${ip}`);
      return { is_known_malicious: false, isp: null };
    }

    const res = await axios.get('https://api.abuseipdb.com/api/v2/check', {
      params: { ipAddress: ip, maxAgeInDays: 90 },
      headers: { 
        Key: process.env.ABUSEIPDB_API_KEY, 
        Accept: 'application/json' 
      },
      timeout: 5000
    });
    
    const score = res.data.data.abuseConfidenceScore;
    const isp = res.data.data.isp;
    const isMalicious = score > 50;
    
    console.log(`[AbuseIPDB] IP ${ip}: Score=${score}, Malicious=${isMalicious}, ISP=${isp}`);

    // Update attacker_profiles with AbuseIPDB data
    await pool.query(
      `UPDATE attacker_profiles 
       SET is_known_malicious = $2, 
           isp = COALESCE($3, isp),
           threat_score = GREATEST(threat_score, $4)
       WHERE ip = $1`,
      [ip, isMalicious, isp, Math.min(score, 100)]
    ).catch(err => console.error('[AbuseIPDB] Update error:', err.message));

    return { is_known_malicious: isMalicious, isp, score };
  } catch (error) {
    console.error(`[AbuseIPDB] API error for ${ip}:`, error.message);
    return { is_known_malicious: false, isp: null, score: 0 };
  }
}

// Optional: Batch check multiple IPs
async function batchCheck(ips) {
  const results = [];
  for (const ip of ips) {
    const result = await check(ip);
    results.push(result);
    // Rate limiting: wait 1 second between requests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  return results;
}

module.exports = { check, batchCheck };