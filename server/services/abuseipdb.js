const axios = require('axios');
const pool = require('../db/pool');

async function check(ip) {
  try {
    const res = await axios.get('https://api.abuseipdb.com/api/v2/check', {
      params: { ipAddress: ip, maxAgeInDays: 90 },
      headers: { Key: process.env.ABUSEIPDB_API_KEY, Accept: 'application/json' },
      timeout: 5000
    });
    const score = res.data.data.abuseConfidenceScore;
    const isp   = res.data.data.isp;
    const result = { is_known_malicious: score > 50, isp };

    // Update attacker_profiles with AbuseIPDB data
    await pool.query(
      `UPDATE attacker_profiles SET is_known_malicious = $2, isp = $3 WHERE ip = $1`,
      [ip, result.is_known_malicious, result.isp]
    ).catch(() => {}); // never crash

    return result;
  } catch {
    return { is_known_malicious: false, isp: null }; // never crash on API failure
  }
}

module.exports = { check };
